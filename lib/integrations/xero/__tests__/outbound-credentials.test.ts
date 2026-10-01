import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Integration } from "@prisma/client";
vi.mock("@/lib/services/xero/credentials", () => ({ getValidXeroAccessToken: vi.fn() }));
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { syncInvoiceToXero, getXeroInvoice, updateXeroInvoiceStatus } from "../../xero";

const integration = () => ({ id: "owner-scoped-xero", provider: "XERO", name: "Company accounts", icon: null, userId: "synthetic-owner", workspaceId: null, tenantId: "synthetic-org", accessToken: "encrypted:must-not-be-sent" } as Integration);
const invoice = { customerName: "Synthetic client", status: "DRAFT", invoiceDate: "2026-10-01", dueDate: "2026-10-08", invoiceNumber: "SYN-1", lineItems: [], currency: "AUD" };
const operations = [
  ["create", (row: Integration) => syncInvoiceToXero(invoice, row, "AU")],
  ["read", (row: Integration) => getXeroInvoice("synthetic-invoice", row)],
  ["update", (row: Integration) => updateXeroInvoiceStatus("synthetic-invoice", "VOIDED", row)],
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getValidXeroAccessToken).mockResolvedValue({ ok: true, data: "synthetic-decrypted-refreshed" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Invoices: [{ InvoiceID: "synthetic-invoice" }] }))));
});
afterEach(() => vi.unstubAllGlobals());
describe("Xero outbound invoice credential dispatch", () => {
  it.each(operations)("%s uses the credential service for the exact scoped integration ID", async (_name, perform) => {
    await perform(integration());
    expect(getValidXeroAccessToken).toHaveBeenCalledWith("owner-scoped-xero", { expectedTenantId: "synthetic-org", expectedUserId: "synthetic-owner", expectedWorkspaceId: null });
    expect(fetch).toHaveBeenCalledOnce();
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]!.headers);
    expect(headers.get("Authorization")).toBe("Bearer synthetic-decrypted-refreshed");
    expect(headers.get("Xero-tenant-id")).toBe("synthetic-org");
  });
  it.each(operations)("%s rejects AI and wrong-provider rows before credentials or network", async (_name, perform) => {
    for (const row of [
      { ...integration(), name: "OpenAI GPT", icon: "[ra:ai]" },
      { ...integration(), name: "Anthropic Claude" },
      { ...integration(), provider: "QUICKBOOKS" },
    ]) await expect(perform(row as Integration)).rejects.toThrow(/integration/i);
    expect(getValidXeroAccessToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(operations)("%s does not dispatch when tenant or usable credentials are missing", async (_name, perform) => {
    await expect(perform({ ...integration(), name: "Xero", tenantId: null })).rejects.toThrow(/tenant/i);
    expect(getValidXeroAccessToken).not.toHaveBeenCalled();
    vi.mocked(getValidXeroAccessToken).mockResolvedValue({ ok: false, reason: "RECONNECT_REQUIRED" });
    await expect(perform(integration())).rejects.toThrow(/RECONNECT_REQUIRED/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("409 recovery also uses decrypted credentials", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Invoices: [{ InvoiceID: "synthetic-existing" }] }), { status: 409 }));
    await syncInvoiceToXero(invoice, integration(), "AU");
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of vi.mocked(fetch).mock.calls) expect(new Headers(options!.headers).get("Authorization")).toBe("Bearer synthetic-decrypted-refreshed");
  });
  it("401 recovery explicitly asks for refresh instead of reusing an unexpired rejected token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(syncInvoiceToXero(invoice, integration(), "AU")).rejects.toThrow(/will retry/);
    expect(getValidXeroAccessToken).toHaveBeenLastCalledWith("owner-scoped-xero", { forceRefresh: true, expectedTenantId: "synthetic-org", expectedUserId: "synthetic-owner", expectedWorkspaceId: null });
  });
});
