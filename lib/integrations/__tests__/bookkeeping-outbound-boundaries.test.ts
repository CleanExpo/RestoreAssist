import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Integration } from "@prisma/client";
vi.mock("@/lib/services/quickbooks/credentials", () => ({ getValidQuickBooksAccessToken: vi.fn() }));
vi.mock("@/lib/services/myob/credentials", () => ({ getValidMYOBAccessToken: vi.fn() }));
import { getValidQuickBooksAccessToken } from "@/lib/services/quickbooks/credentials";
import { getValidMYOBAccessToken } from "@/lib/services/myob/credentials";
import { getQuickBooksInvoice, syncInvoiceToQuickBooks } from "../quickbooks";
import { getMYOBInvoice, syncInvoiceToMYOB, updateMYOBInvoiceStatus } from "../myob";

const invoice = { customerName: "Synthetic client", lineItems: [], invoiceDate: "2026-10-01", dueDate: "2026-10-08", status: "DRAFT" };
const row = (provider: string) => Object.freeze({ id: "scoped-synthetic-id", provider, name: provider, userId: "synthetic-owner", realmId: "synthetic-realm", tenantId: "synthetic-company", accessToken: "encrypted:must-not-be-sent" }) as Integration;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getValidQuickBooksAccessToken).mockResolvedValue({ ok: true, data: "synthetic-quickbooks" });
  vi.mocked(getValidMYOBAccessToken).mockResolvedValue({ ok: true, data: "synthetic-myob" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Invoice: { Id: "synthetic-invoice" }, UID: "synthetic-invoice", RowVersion: "1" }))));
});
afterEach(() => vi.unstubAllGlobals());
describe("direct bookkeeping invoice boundaries", () => {
  it.each([
    ["QUICKBOOKS", (integration: Integration) => syncInvoiceToQuickBooks(invoice, integration, "AU")],
    ["QUICKBOOKS", (integration: Integration) => getQuickBooksInvoice("synthetic-invoice", integration)],
    ["MYOB", (integration: Integration) => syncInvoiceToMYOB(invoice, integration, "AU")],
    ["MYOB", (integration: Integration) => getMYOBInvoice("synthetic-invoice", integration)],
    ["MYOB", (integration: Integration) => updateMYOBInvoiceStatus("synthetic-invoice", "Closed", integration)],
  ] as const)("%s rejects AI rows and another OAuth provider before token lookup or requests", async (provider, perform) => {
    await expect(perform({ ...row(provider), name: "OpenAI GPT", icon: "[ra:ai]" })).rejects.toThrow(/integration/i);
    await expect(perform(row("XERO"))).rejects.toThrow(/integration/i);
    expect(getValidQuickBooksAccessToken).not.toHaveBeenCalled(); expect(getValidMYOBAccessToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["QUICKBOOKS", "synthetic-quickbooks", (integration: Integration) => getQuickBooksInvoice("synthetic-invoice", integration)],
    ["MYOB", "synthetic-myob", (integration: Integration) => getMYOBInvoice("synthetic-invoice", integration)],
    ["MYOB", "synthetic-myob", (integration: Integration) => updateMYOBInvoiceStatus("synthetic-invoice", "Closed", integration)],
  ] as const)("%s read/status requests use decrypted credentials without altering the stored row", async (provider, token, perform) => {
    const stored = row(provider); await perform(stored);
    expect(fetch).toHaveBeenCalled();
    for (const [, options] of vi.mocked(fetch).mock.calls) expect(new Headers(options?.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(stored.accessToken).toBe("encrypted:must-not-be-sent");
  });
});
