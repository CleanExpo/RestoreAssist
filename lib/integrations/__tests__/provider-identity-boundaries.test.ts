import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: {} as Record<string, unknown> }));
const mocks = vi.hoisted(() => ({
  decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, "")),
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  update: vi.fn(),
  updateMany: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  integration: { findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => select ? Object.fromEntries(Object.keys(select).map(key => [key, state.row[key]])) : state.row), update: mocks.update, updateMany: mocks.updateMany },
  integrationSyncLog: { create: mocks.log },
} }));
vi.mock("@/lib/credential-vault", () => ({ decrypt: mocks.decrypt, encrypt: mocks.encrypt }));
vi.mock("@/lib/integrations/dev-mode", () => ({ isIntegrationDevMode: () => false, MOCK_CREDENTIALS: {} }));

import { getTokens, storeTokens, disconnectIntegration, markIntegrationError, logSync } from "../oauth-handler";
import { createClientForIntegration } from "../index";
import { XeroClient, createXeroClient } from "../xero/client";
import { QuickBooksClient, createQuickBooksClient } from "../quickbooks/client";
import { MYOBClient, createMYOBClient } from "../myob/client";
import { ServiceM8Client, createServiceM8Client } from "../servicem8/client";
import { AscoraClient, createAscoraClient } from "../ascora/client";
import { syncNIRJobToQuickBooks } from "../quickbooks/nir-sync";
import { syncNIRJobToMYOB } from "../myob/nir-sync";
import { syncNIRJobToServiceM8 } from "../servicem8/nir-sync";
import { syncNIRJobToAscora } from "../ascora/nir-sync";
import { getValidQuickBooksAccessToken } from "@/lib/services/quickbooks/credentials";
import { getValidMYOBAccessToken } from "@/lib/services/myob/credentials";

const genuine = (provider = "XERO") => ({
  id: "synthetic-connection", userId: "synthetic-owner", workspaceId: null, updatedAt: new Date("2026-10-01"), config: null, provider, name: "Our accounts", icon: null,
  status: "CONNECTED", accessToken: "encrypted:synthetic-access", refreshToken: "encrypted:synthetic-refresh",
  tokenExpiresAt: new Date("2099-01-01"), tenantId: "synthetic-org", realmId: "synthetic-realm", companyId: "synthetic-company",
});
beforeEach(() => {
  vi.clearAllMocks(); state.row = genuine();
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    const same = Object.entries(where).every(([key, value]) => value instanceof Date ? +(state.row[key] as Date) === +value : state.row[key] === value);
    if (!same) return { count: 0 };
    Object.assign(state.row, data); return { count: 1 };
  });
  mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state.row, data));
  vi.stubEnv("XERO_CLIENT_ID", "synthetic-client"); vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-secret");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Contacts: [], Invoices: [] }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const rejectedRows = [
  { ...genuine(), name: "OpenAI GPT", icon: "[ra:ai]" },
  { ...genuine(), name: "Anthropic Claude" },
  { ...genuine(), name: "Custom assistant", icon: "[ra:ai]" },
  { ...genuine(), name: "Private assistant", config: JSON.stringify({ apiKeyType: "OPENAI" }) },
  genuine("QUICKBOOKS"),
  genuine("ASCORA"),
];

describe("OAuth token and mutation boundaries", () => {
  it.each(rejectedRows)("refuses mismatched identity before decrypt, mutation or traffic: $name/$provider", async row => {
    state.row = row;
    await expect(getTokens("synthetic-connection", "XERO")).rejects.toThrow(/integration/i);
    await expect(storeTokens("synthetic-connection", "new-token", "new-refresh", 3600, "XERO")).rejects.toThrow(/integration/i);
    await expect(disconnectIntegration("synthetic-connection", "XERO")).rejects.toThrow(/integration/i);
    await expect(markIntegrationError("synthetic-connection", "Synthetic failure", "XERO")).rejects.toThrow(/integration/i);
    await expect(logSync("synthetic-connection", "FULL", "FAILED", 0, 0, "Synthetic failure", "XERO")).rejects.toThrow(/integration/i);
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled(); expect(mocks.log).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("supports genuine custom-named OAuth rows and pending/disconnected token exchange", async () => {
    state.row = { ...genuine(), status: "DISCONNECTED", icon: "/integrations/xero.svg", tenantId: null, tokenExpiresAt: null };
    await expect(getTokens("synthetic-connection", "XERO")).resolves.toMatchObject({ accessToken: "synthetic-access" });
    await storeTokens("synthetic-connection", "synthetic-new", undefined, 3600, "XERO");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accessToken: "encrypted:synthetic-new" }) }));
  });
});

describe("Xero organisation readiness on OAuth completion", () => {
  const complete = () => new XeroClient("synthetic-connection").exchangeCodeForTokens("synthetic-code", "https://example.test/callback");
  function discovery(response: Response) {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }))).mockResolvedValueOnce(response);
  }
  it.each([
    ["empty", new Response("[]")],
    ["unavailable", new Response("Synthetic unavailable", { status: 503 })],
    ["ambiguous", new Response(JSON.stringify([{ tenantId: "org-a" }, { tenantId: "org-b" }]))],
    ["malformed", new Response(JSON.stringify({ error: "malformed list" }))],
  ])("keeps an incomplete exchange out of CONNECTED on %s discovery", async (_name, response) => {
    state.row = { ...genuine(), name: "Xero", tenantId: null, status: "DISCONNECTED" };
    discovery(response);
    await expect(complete()).rejects.toThrow(/organisation/i);
    expect(state.row.status).toBe("ERROR");
    expect(state.row.accessToken).toBe("encrypted:synthetic-access");
    expect(mocks.updateMany.mock.calls.some(([args]) => args.data.status === "CONNECTED")).toBe(false);
  });
  it("connects only after the unique authorised organisation is stored", async () => {
    state.row = { ...genuine(), name: "Xero", tenantId: null, status: "DISCONNECTED" };
    discovery(new Response(JSON.stringify([{ tenantId: "only-org" }])));
    await complete();
    expect(state.row).toMatchObject({ tenantId: "only-org", status: "CONNECTED" });
    const connected = mocks.updateMany.mock.calls.filter(([args]) => args.data.status === "CONNECTED");
    expect(connected).toHaveLength(1);
    expect(connected[0][0].data.tenantId).toBe("only-org");
  });
  it("preserves the existing tenant only when it is in the returned authorised set", async () => {
    discovery(new Response(JSON.stringify([{ tenantId: "other-org" }, { tenantId: "synthetic-org" }])));
    await complete();
    expect(state.row.tenantId).toBe("synthetic-org");
  });
  it("does not silently switch an old tenant to the first of multiple new organisations", async () => {
    discovery(new Response(JSON.stringify([{ tenantId: "new-org-a" }, { tenantId: "new-org-b" }])));
    await expect(complete()).rejects.toThrow(/organisation/i);
    expect(state.row.status).toBe("ERROR");
    expect(state.row.tenantId).toBeNull();
  });
  it("clears the old active tenant when new-grant discovery is interrupted", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }))).mockRejectedValueOnce(new Error("Synthetic network interruption"));
    await expect(complete()).rejects.toThrow(/organisation lookup was interrupted/);
    expect(state.row).toMatchObject({ status: "ERROR", tenantId: null, accessToken: "encrypted:synthetic-access" });
  });
  it.each([
    ["empty", "[]", 200],
    ["unavailable", "Synthetic outage", 503],
    ["different sole organisation", JSON.stringify([{ tenantId: "different-org" }]), 200],
  ] as const)("does not retain or silently replace the previous organisation on %s discovery", async (_name, body, status) => {
    discovery(new Response(body, { status }));
    await expect(complete()).rejects.toThrow(/organisation/i);
    expect(state.row).toMatchObject({ status: "ERROR", tenantId: null, accessToken: "encrypted:synthetic-access" });
    expect(mocks.updateMany.mock.calls.some(([args]) => args.data.status === "CONNECTED")).toBe(false);
  });
});

describe("provider factory and direct-construction boundaries", () => {
  it.each([
    ["QUICKBOOKS", syncNIRJobToQuickBooks], ["MYOB", syncNIRJobToMYOB],
    ["SERVICEM8", syncNIRJobToServiceM8], ["ASCORA", syncNIRJobToAscora],
  ] as const)("refuses direct %s NIR dispatch using another provider ID", async (_provider, dispatch) => {
    await expect(dispatch("synthetic-connection", {} as never)).rejects.toThrow(/integration/i);
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("QuickBooks credential service rejects another provider before tokens", async () => {
    await expect(getValidQuickBooksAccessToken("synthetic-connection")).resolves.toMatchObject({ ok: false, reason: "INVALID_INTEGRATION" });
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("MYOB credential service rejects another provider before tokens", async () => {
    await expect(getValidMYOBAccessToken("synthetic-connection")).resolves.toMatchObject({ ok: false, reason: "INVALID_INTEGRATION" });
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["QUICKBOOKS", getValidQuickBooksAccessToken], ["MYOB", getValidMYOBAccessToken],
  ] as const)("%s can explicitly refresh an unexpired rejected token", async (provider, credentials) => {
    state.row = { ...genuine(provider), name: provider };
    vi.stubEnv(`${provider}_CLIENT_ID`, "synthetic-client"); vi.stubEnv(`${provider}_CLIENT_SECRET`, "synthetic-secret");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "replacement-access", refresh_token: "replacement-refresh", expires_in: 3600 })));
    await expect(credentials("synthetic-connection", { forceRefresh: true })).resolves.toEqual({ ok: true, data: "replacement-access" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("MYOB NIR uses the canonical tenantId rather than unrelated companyId metadata", async () => {
    state.row = { ...genuine("MYOB"), name: "MYOB", tenantId: "canonical-company", companyId: "wrong-company" };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Items: [{ UID: "synthetic-customer" }] })))
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { Location: "https://api.myob.com/accountright/canonical-company/Sale/Invoice/Service/synthetic-sale" } }));
    await expect(syncNIRJobToMYOB("synthetic-connection", { country: "AU", clientName: "Synthetic client", damageType: "WATER", scopeItems: [], reportDate: new Date("2026-10-01"), reportId: "synthetic-report", reportNumber: "SYN-1", propertyAddress: "Synthetic address" } as never)).resolves.toMatchObject({ myobSaleId: "synthetic-sale" });
    for (const [url] of vi.mocked(fetch).mock.calls) expect(String(url)).toContain("/accountright/canonical-company/");
  });
  it("MYOB NIR refuses companyId-only metadata without its canonical company binding", async () => {
    state.row = { ...genuine("MYOB"), name: "MYOB", tenantId: null, companyId: "wrong-company" };
    await expect(syncNIRJobToMYOB("synthetic-connection", {} as never)).rejects.toThrow(/company file ID missing/i);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(rejectedRows.slice(0, 3))("rejects legacy AI rows from all generic/direct Xero paths: $name", async row => {
    state.row = row;
    await expect(createClientForIntegration("synthetic-connection")).rejects.toThrow(/integration/i);
    await expect(createXeroClient("synthetic-connection")).rejects.toThrow(/integration/i);
    const client = new XeroClient("synthetic-connection", "synthetic-org");
    await expect(client.fetchClients()).rejects.toThrow(/integration/i);
    await expect(client.refreshAccessToken()).rejects.toThrow(/integration/i);
    await expect(client.exchangeCodeForTokens("synthetic-code", "https://example.test/callback")).rejects.toThrow(/integration/i);
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["QUICKBOOKS", QuickBooksClient, createQuickBooksClient],
    ["MYOB", MYOBClient, createMYOBClient],
    ["SERVICEM8", ServiceM8Client, createServiceM8Client],
    ["ASCORA", AscoraClient, createAscoraClient],
  ] as const)("rejects direct %s adapter exchange/refresh/fetch using a genuine Xero ID", async (_provider, Client, factory) => {
    await expect(factory("synthetic-connection")).rejects.toThrow(/integration/i);
    const client = new Client("synthetic-connection");
    await expect(client.exchangeCodeForTokens("synthetic-code", "https://example.test/callback")).rejects.toThrow(/integration/i);
    await expect(client.refreshAccessToken()).rejects.toThrow(/integration/i);
    await expect(client.fetchClients()).rejects.toThrow(/integration/i);
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a genuine Xero client request with a decrypted access token", async () => {
    const client = await createXeroClient("synthetic-connection");
    await expect(client.fetchClients()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
    const options = vi.mocked(fetch).mock.calls[0][1]!;
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer synthetic-access");
    expect(new Headers(options.headers).get("xero-tenant-id")).toBe("synthetic-org");
  });
});
