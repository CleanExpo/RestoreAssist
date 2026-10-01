import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Integration } from "@prisma/client";
const state = vi.hoisted(() => ({ row: {} as Record<string, any>, report: null as null | { userId: string; workspaceId: string | null }, writes: [] as Record<string, any>[], beforeRead: null as (() => void) | null }));
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), decrypt: vi.fn((v: string) => v.replace(/^cipher:/, "")) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  integration: {
    findMany: vi.fn(async () => [{ ...state.row }]),
    findFirst: vi.fn(async () => state.row.accessToken ? { id: state.row.id } : null),
    findUnique: vi.fn(async () => { state.beforeRead?.(); return { ...state.row }; }),
    update: vi.fn(async ({ data }) => { Object.assign(state.row, data); state.writes.push(data); return { ...state.row }; }),
    updateMany: mocks.updateMany,
  }, externalClient: { upsert: mocks.upsert }, externalJob: { upsert: mocks.upsert }, report: { findUnique: vi.fn(async () => state.report) }, integrationSyncLog: { create: vi.fn() },
} }));
vi.mock("@/lib/credential-vault", () => ({ encrypt: (v: string) => `cipher:${v}`, decrypt: mocks.decrypt }));
vi.mock("@/lib/integrations/dev-mode", () => ({ isIntegrationDevMode: () => false, MOCK_CREDENTIALS: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "synthetic-owner" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/subscription-guard", () => ({ checkIntegrationAccess: vi.fn(async () => ({ isAllowed: true })), createSubscriptionRequiredResponse: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ requireAddon: vi.fn(async () => ({ allowed: true })) }));
import { NextRequest } from "next/server";
import { POST as syncRoute } from "@/app/api/integrations/oauth/[provider]/sync/route";
import { XeroClient } from "../client";
import { disconnectIntegration } from "../../oauth-handler";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
vi.mock("../account-code-resolver", () => ({ resolveAccountCodes: vi.fn(async () => new Map()), resolveAccountCodeForItemType: vi.fn() }));
import { syncNIRJobToXero } from "../nir-sync";
import { getXeroInvoice, syncInvoiceToXero } from "../../xero";
const token = (value: string) => new Response(JSON.stringify({ access_token: value, refresh_token: `refresh-${value}`, expires_in: 3600 }));
const connection = (tenantId: string) => new Response(JSON.stringify([{ tenantId }]));
const exchange = (code: string) => new XeroClient("synthetic-xero").exchangeCodeForTokens(code, "https://synthetic.example.test/callback");
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); state.writes = []; state.beforeRead = null; state.report = { userId: "synthetic-owner", workspaceId: "workspace-a" };
  state.row = { id: "synthetic-xero", userId: "synthetic-owner", workspaceId: "workspace-a", provider: "XERO", name: "Xero", icon: null, config: null, status: "DISCONNECTED", tenantId: null, accessToken: null, refreshToken: null, tokenExpiresAt: null, updatedAt: new Date("2026-10-01T00:00:00Z") };
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    const same = Object.entries(where).every(([key, expected]) => expected instanceof Date ? +state.row[key] === +expected : state.row[key] === expected);
    if (!same) return { count: 0 };
    Object.assign(state.row, data, { updatedAt: data.updatedAt ?? new Date(+state.row.updatedAt + 1) }); state.writes.push(data); return { count: 1 };
  });
  mocks.transaction.mockImplementation(async callback => callback({ integration: { updateMany: mocks.updateMany }, externalClient: { upsert: mocks.upsert }, externalJob: { upsert: mocks.upsert } }));
  vi.stubEnv("XERO_CLIENT_ID", "synthetic-client"); vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-secret");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected synthetic request denied"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function pendingExchange() {
  const entered = deferred<void>(); const release = deferred<Response>();
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).includes("/connect/token")) return token(new URLSearchParams(init?.body as URLSearchParams).get("code")!);
    if (String(input).endsWith("/connections")) {
      const access = new Headers(init?.headers).get("Authorization");
      if (access === "Bearer grant-a") { entered.resolve(); return release.promise; }
      if (access === "Bearer grant-b") return connection("tenant-b");
    }
    throw new Error("Unexpected synthetic request denied");
  });
  return { entered, release };
}
describe("Xero binding concurrency", () => {
  it("refuses a replacement grant inserted after its own refresh commit", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:old", refreshToken: "cipher:refresh-old", tokenExpiresAt: new Date("2020-01-01") });
    state.beforeRead = () => {
      if (state.row.accessToken === "cipher:refreshed-a") {
        Object.assign(state.row, {
          accessToken: "cipher:replacement", refreshToken: "cipher:replacement-refresh",
          updatedAt: new Date(+state.row.updatedAt + 1),
        });
      }
    };
    vi.mocked(fetch).mockImplementation(async input => {
      if (String(input).includes("/connect/token")) return token("refreshed-a");
      if (String(input).includes("/Contacts")) return new Response(JSON.stringify({ Contacts: [] }));
      throw new Error("Unexpected synthetic request denied");
    });
    await expect(new XeroClient("synthetic-xero", "tenant-a").fetchClients()).rejects.toThrow(/changed/);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/Contacts"))).toHaveLength(0);
    expect(state.row).toMatchObject({ accessToken: "cipher:replacement", status: "CONNECTED" });
  });
  it("commits each callback token and tenant together and rejects an older overlapping completion", async () => {
    const { entered, release } = pendingExchange(); const first = exchange("grant-a"); const firstResult = first.catch(error => error);
    await entered.promise; await exchange("grant-b"); release.resolve(connection("tenant-a"));
    expect(await firstResult).toBeInstanceOf(Error);
    expect(state.row).toMatchObject({ accessToken: "cipher:grant-b", tenantId: "tenant-b", status: "CONNECTED" });
    expect(state.writes.filter(write => write.status === "CONNECTED")).toEqual([expect.objectContaining({ accessToken: "cipher:grant-b", tenantId: "tenant-b" })]);
  });
  it("does not let an older failed discovery overwrite a newer successful callback", async () => {
    const { entered, release } = pendingExchange(); const firstResult = exchange("grant-a").catch(error => error);
    await entered.promise; await exchange("grant-b"); release.resolve(new Response("Synthetic failure", { status: 503 }));
    expect(await firstResult).toBeInstanceOf(Error);
    expect(state.row).toMatchObject({ accessToken: "cipher:grant-b", tenantId: "tenant-b", status: "CONNECTED" });
  });
  it.each(["disconnect", "workspace-change"])("refuses completion after %s changed its original binding", async variant => {
    const { entered, release } = pendingExchange(); const firstResult = exchange("grant-a").catch(error => error);
    await entered.promise;
    Object.assign(state.row, variant === "disconnect" ? { accessToken: null, refreshToken: null, tenantId: null, status: "DISCONNECTED" } : { workspaceId: "workspace-b" });
    state.row.updatedAt = new Date(+state.row.updatedAt + 1); release.resolve(connection("tenant-a"));
    expect(await firstResult).toBeInstanceOf(Error); expect(state.row.accessToken).toBeNull(); expect(state.writes).toEqual([]);
  });
  it.each(["DISCONNECTED", "ERROR"])("rejects a cached old tenant against a %s incomplete binding", async status => {
    const client = new XeroClient("synthetic-xero", "tenant-a");
    Object.assign(state.row, { status, tenantId: null, accessToken: "cipher:new-incomplete-grant" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ Contacts: [] })));
    await expect(client.fetchClients()).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a cached old tenant even after another valid tenant is connected", async () => {
    const client = new XeroClient("synthetic-xero", "tenant-a");
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-b", accessToken: "cipher:grant-b", tokenExpiresAt: new Date("2099-01-01") });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ Contacts: [] })));
    await expect(client.fetchClients()).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not pair a stale direct-invoice tenant with a newly connected grant", async () => {
    const old = { ...state.row, status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a" } as Integration;
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-b", accessToken: "cipher:grant-b", tokenExpiresAt: new Date("2099-01-01") });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ Invoices: [] })));
    await expect(getXeroInvoice("synthetic-invoice", old)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])("refresh completion success=%s cannot overwrite a newer disconnected binding", async success => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", refreshToken: "cipher:refresh-a", tokenExpiresAt: new Date("2020-01-01") });
    const entered = deferred<void>(); const release = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => { entered.resolve(); return release.promise; });
    const refresh = new XeroClient("synthetic-xero", "tenant-a").refreshAccessToken().catch(error => error);
    await entered.promise; Object.assign(state.row, { status: "DISCONNECTED", tenantId: null, accessToken: null, refreshToken: null, updatedAt: new Date(+state.row.updatedAt + 1) });
    release.resolve(success ? token("refreshed-a") : new Response("invalid_grant", { status: 400 }));
    expect(await refresh).toBeInstanceOf(Error); expect(state.row).toMatchObject({ status: "DISCONNECTED", accessToken: null, tenantId: null });
    expect(state.writes).toEqual([]); expect(fetch).toHaveBeenCalledOnce();
  });
  it("commits a valid grant and organisation together without an incomplete intermediate write", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(token("grant-a")).mockResolvedValueOnce(connection("tenant-a"));
    await exchange("grant-a");
    expect(state.writes).toEqual([expect.objectContaining({ status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", refreshToken: "cipher:refresh-grant-a" })]);
  });
  it("refreshes a ready binding and sends the refreshed token with its own tenant", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:old", refreshToken: "cipher:refresh-old", tokenExpiresAt: new Date("2020-01-01") });
    vi.mocked(fetch).mockResolvedValueOnce(token("refreshed-a")).mockResolvedValueOnce(new Response(JSON.stringify({ Contacts: [] })));
    await expect(new XeroClient("synthetic-xero", "tenant-a").fetchClients()).resolves.toEqual([]);
    const headers = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer refreshed-a"); expect(headers.get("xero-tenant-id")).toBe("tenant-a");
    expect(state.row).toMatchObject({ status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:refreshed-a" });
  });
  it("disconnects the original unchanged grant", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", refreshToken: "cipher:refresh-a" });
    vi.mocked(fetch).mockImplementation(async () => new Response("{}"));
    await disconnectIntegration("synthetic-xero", "XERO");
    expect(state.row).toMatchObject({ status: "DISCONNECTED", accessToken: null, refreshToken: null, tenantId: null });
  });
  it("an older disconnect only revokes its snapshot and cannot clear a newer connection", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", refreshToken: "cipher:refresh-a" });
    const entered = deferred<void>(); const release = deferred<Response>(); let first = true;
    vi.mocked(fetch).mockImplementation(async () => {
      if (first) { first = false; entered.resolve(); return release.promise; }
      return new Response("{}");
    });
    const result = disconnectIntegration("synthetic-xero", "XERO").catch(error => error);
    await entered.promise;
    Object.assign(state.row, { accessToken: "cipher:grant-b", refreshToken: "cipher:refresh-b", tenantId: "tenant-b", updatedAt: new Date(+state.row.updatedAt + 1) });
    release.resolve(new Response("{}"));
    expect(await result).toBeInstanceOf(Error); expect(state.row).toMatchObject({ status: "CONNECTED", accessToken: "cipher:grant-b", tenantId: "tenant-b" });
    expect(vi.mocked(fetch).mock.calls.map(([, init]) => new URLSearchParams(init?.body as string).get("token"))).toEqual(["refresh-a", "grant-a"]);
    expect(state.writes).toEqual([]);
  });
  it.each([
    { expectedTenantId: "tenant-b" }, { expectedUserId: "other-owner" }, { expectedWorkspaceId: null },
  ])("rejects mismatched context before decrypt or refresh: %j", async expected => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2020-01-01") });
    await expect(getValidXeroAccessToken("synthetic-xero", expected)).resolves.toMatchObject({ ok: false, reason: "BINDING_CHANGED" });
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: " " }, { accessToken: " " }, { accessToken: "cipher: " }])("refuses blank readiness fields %j", async blank => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a" }, blank);
    await expect(getValidXeroAccessToken("synthetic-xero")).resolves.toMatchObject({ ok: false, reason: "DISCONNECTED" }); expect(fetch).not.toHaveBeenCalled();
  });
  it("handles corrupt ciphertext as a secret-free structured failure", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a" });
    mocks.decrypt.mockImplementationOnce(() => { throw new Error("synthetic private ciphertext error"); });
    const result = await getValidXeroAccessToken("synthetic-xero");
    expect(result).toMatchObject({ ok: false, reason: "DISCONNECTED" }); expect(JSON.stringify(result)).not.toContain("ciphertext"); expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses conflicting cached and expected refresh tenants before decrypt", async () => {
    await expect(new XeroClient("synthetic-xero", "tenant-a").refreshAccessToken({ expectedTenantId: "tenant-b" })).rejects.toThrow(/binding changed/);
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    null, { userId: "other-owner", workspaceId: "workspace-a" },
    { userId: "synthetic-owner", workspaceId: "workspace-b" },
    { userId: "synthetic-owner", workspaceId: null },
  ])("refuses direct NIR dispatch outside the source report scope: %j", async report => {
    state.report = report;
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    await expect(syncNIRJobToXero("synthetic-xero", { reportId: "synthetic-report" } as never)).rejects.toThrow();
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["workspace-a", null])("uses the matching source scope for NIR invoice dispatch: %s", async workspaceId => {
    state.report = { userId: "synthetic-owner", workspaceId };
    Object.assign(state.row, { workspaceId, status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Invoices: [{ InvoiceID: "synthetic-invoice", InvoiceNumber: "SYN-1", Status: "DRAFT" }] })));
    await expect(syncNIRJobToXero("synthetic-xero", { reportId: "synthetic-report", country: "AU", currency: "AUD", scopeItems: [], reportDate: new Date("2026-10-01"), damageType: "WATER" } as never)).resolves.toMatchObject({ xeroInvoiceId: "synthetic-invoice" });
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer grant-a"); expect(headers.get("Xero-tenant-id")).toBe("tenant-a");
  });
  it.each([{ userId: "other-owner" }, { workspaceId: null }])("refuses source invoice context mismatch: %j", async context => {
    const integration = { ...state.row, tenantId: "tenant-a" } as Integration;
    await expect(syncInvoiceToXero(context, integration, "AU")).rejects.toThrow(/ownership/);
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("does not import old-tenant data if reconnect finishes during the provider response", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    const entered = deferred<void>(); const release = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => { entered.resolve(); return release.promise; });
    const result = new XeroClient("synthetic-xero", "tenant-a").syncClients().catch(error => error);
    await entered.promise; Object.assign(state.row, { tenantId: "tenant-b", accessToken: "cipher:grant-b", status: "CONNECTED", syncError: null, updatedAt: new Date(+state.row.updatedAt + 1) });
    release.resolve(new Response(JSON.stringify({ Contacts: [{ ContactID: "old-contact", Name: "Old company contact", IsCustomer: true }] })));
    expect(await result).toBeInstanceOf(Error); expect(mocks.upsert).not.toHaveBeenCalled();
    expect(state.row).toMatchObject({ status: "CONNECTED", tenantId: "tenant-b", syncError: null });
  });
  it("does not let a delayed failed sync mark a newer connected grant ERROR", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    const entered = deferred<void>(); const release = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => { entered.resolve(); return release.promise; });
    const client = new XeroClient("synthetic-xero", "tenant-a");
    const result = client.syncWithLifecycle({ syncClients: true, syncJobs: false }, { expectedTenantId: "tenant-a", expectedUserId: "synthetic-owner", expectedWorkspaceId: "workspace-a" }).catch(error => error);
    await entered.promise; Object.assign(state.row, { tenantId: "tenant-b", accessToken: "cipher:grant-b", status: "CONNECTED", syncError: null, updatedAt: new Date(+state.row.updatedAt + 1) });
    release.resolve(new Response("Synthetic provider error", { status: 503 }));
    expect(await result).toBeInstanceOf(Error); expect(state.row).toMatchObject({ status: "CONNECTED", tenantId: "tenant-b", syncError: null });
  });

  it("imports current clients in bounded guarded transactions and completes the lifecycle", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    const Contacts = Array.from({ length: 101 }, (_, index) => ({ ContactID: `contact-${index}`, Name: `Synthetic client ${index}`, IsCustomer: true }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Contacts, pagination: { pageCount: 1 } })));
    await expect(new XeroClient("synthetic-xero", "tenant-a").syncWithLifecycle({ syncClients: true, syncJobs: false }, { expectedWorkspaceId: "workspace-a" })).resolves.toEqual({ clientsCount: 101, jobsCount: 0 });
    expect(mocks.transaction).toHaveBeenCalledTimes(2); expect(mocks.upsert).toHaveBeenCalledTimes(101);
    expect(state.row.status).toBe("CONNECTED");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });
  it("refuses an import batch when its binding changes just before the transaction claim", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Contacts: [{ ContactID: "old-contact", Name: "Old company contact", IsCustomer: true }] })));
    mocks.transaction.mockImplementationOnce(async callback => {
      Object.assign(state.row, { tenantId: "tenant-b", accessToken: "cipher:grant-b", updatedAt: new Date(+state.row.updatedAt + 1) });
      return callback({ integration: { updateMany: mocks.updateMany }, externalClient: { upsert: mocks.upsert } });
    });
    await expect(new XeroClient("synthetic-xero", "tenant-a").syncClients()).rejects.toThrow(/changed/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("the actual sync route cannot mark a replacement connection ERROR after an old request fails", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    const entered = deferred<void>(); const release = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => { entered.resolve(); return release.promise; });
    const response = syncRoute(new NextRequest("https://synthetic.example.test/api/integrations/oauth/xero/sync", { method: "POST", body: JSON.stringify({ syncJobs: false }) }), { params: Promise.resolve({ provider: "xero" }) });
    await entered.promise; Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-b", accessToken: "cipher:grant-b", syncError: null, updatedAt: new Date(+state.row.updatedAt + 1) });
    release.resolve(new Response("Synthetic unavailable", { status: 503 }));
    expect((await response).status).toBeGreaterThanOrEqual(400);
    expect(state.row).toMatchObject({ status: "CONNECTED", tenantId: "tenant-b", accessToken: "cipher:grant-b", syncError: null });
  });

  it("a same-millisecond disconnect of a pending empty binding invalidates an earlier callback", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(state.row.updatedAt);
    const { entered, release } = pendingExchange(); const result = exchange("grant-a").catch(error => error);
    await entered.promise; await disconnectIntegration("synthetic-xero", "XERO");
    release.resolve(connection("tenant-a"));
    expect(await result).toBeInstanceOf(Error); expect(state.row).toMatchObject({ status: "DISCONNECTED", tenantId: null, accessToken: null });
  });

  it("a delayed NIR failure cannot mark a replacement connection ERROR", async () => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", tokenExpiresAt: new Date("2099-01-01") });
    const entered = deferred<void>(); const release = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async () => { entered.resolve(); return release.promise; });
    const result = syncNIRJobToXero("synthetic-xero", { reportId: "synthetic-report", country: "AU", currency: "AUD", scopeItems: [], reportDate: new Date("2026-10-01"), damageType: "WATER" } as never).catch(error => error);
    await entered.promise; Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-b", accessToken: "cipher:grant-b", syncError: null, updatedAt: new Date(+state.row.updatedAt + 1) });
    release.resolve(new Response("{}", { status: 503 }));
    expect(await result).toBeInstanceOf(Error); expect(state.row).toMatchObject({ status: "CONNECTED", tenantId: "tenant-b", syncError: null });
  });

  it.each(["exchange", "refresh"])("rejects a blank access token from %s without committing it", async operation => {
    Object.assign(state.row, { status: "CONNECTED", tenantId: "tenant-a", accessToken: "cipher:grant-a", refreshToken: "cipher:refresh-a" });
    vi.mocked(fetch).mockResolvedValueOnce(token(" "));
    const client = new XeroClient("synthetic-xero", "tenant-a");
    await expect(operation === "exchange" ? client.exchangeCodeForTokens("code", "https://synthetic.example.test/callback") : client.refreshAccessToken()).rejects.toThrow(/invalid credentials/);
    expect(state.row.accessToken).toBe("cipher:grant-a"); expect(fetch).toHaveBeenCalledOnce();
  });

});
