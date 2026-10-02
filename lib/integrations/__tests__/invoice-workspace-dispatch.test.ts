import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ invoiceWorkspace: null as string | null, rows: [] as any[] }));
const calls = vi.hoisted(() => ({ dispatch: vi.fn(), candidates: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  invoiceSyncJob: { findMany: async () => [{ id: "job", invoiceId: "invoice", provider: "XERO", retryCount: 0 }], updateMany: async () => ({ count: 1 }), update: calls.update, count: async () => 0 },
  invoice: { findUnique: async () => ({ id: "invoice", userId: "owner", workspaceId: fixture.invoiceWorkspace, currency: "AUD" }) },
  invoiceAuditLog: { create: vi.fn() },
  integration: { findMany: calls.candidates, findFirst: async ({ where }: any) => fixture.rows.find(row => row.id === where.id && row.userId === where.userId && row.workspaceId === where.workspaceId) },
} }));
vi.mock("../xero", () => ({ syncInvoiceToXero: calls.dispatch }));
vi.mock("../quickbooks", () => ({ syncInvoiceToQuickBooks: vi.fn() }));
vi.mock("../myob", () => ({ syncInvoiceToMYOB: vi.fn() }));
vi.mock("../rate-limiter", () => ({ withRateLimit: (_: unknown, fn: () => unknown) => fn() }));
vi.mock("../circuit-breaker", () => ({ withCircuitBreaker: (_: unknown, fn: () => unknown) => fn(), DEFAULT_CIRCUIT_OPTIONS: {} }));
vi.mock("../retry", () => ({ retryWithExponentialBackoff: (fn: () => unknown) => fn(), DEFAULT_RETRY_OPTIONS: {} }));
import { processNextBatch } from "../sync-queue";
const genuine = { id: "xero", userId: "owner", workspaceId: null, provider: "XERO", name: "Xero", status: "CONNECTED", tenantId: "org" };
beforeEach(() => {
  vi.clearAllMocks(); fixture.invoiceWorkspace = null; fixture.rows = [];
  calls.candidates.mockImplementation(async ({ where }) => fixture.rows.filter(row => row.userId === where.userId && row.provider === where.provider && (where.workspaceId === undefined || row.workspaceId === where.workspaceId)));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network denied"); }));
});
afterEach(() => vi.unstubAllGlobals());
describe("real durable invoice dispatch workspace boundary", () => {
  it.each([null, "workspace-a"])("refuses another workspace for source %s", async workspace => {
    fixture.invoiceWorkspace = workspace; fixture.rows = [{ ...genuine, workspaceId: "workspace-b" }];
    expect(await processNextBatch()).toMatchObject({ processed: 0, failed: 1 });
    expect(calls.dispatch).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("never selects either AI provider and reports the failed queue attempt", async () => {
    fixture.rows = [{ ...genuine, name: "OpenAI GPT", icon: "[ra:ai]" }, { ...genuine, name: "Anthropic Claude", icon: "[ra:ai]" }];
    expect(await processNextBatch()).toMatchObject({ processed: 0, failed: 1 }); expect(calls.dispatch).not.toHaveBeenCalled();
  });
  it.each([null, "workspace-a"])("dispatches only the genuine connection in exact source workspace %s", async workspace => {
    fixture.invoiceWorkspace = workspace; fixture.rows = [{ ...genuine, id: "other", workspaceId: "workspace-b" }, { ...genuine, workspaceId: workspace }];
    expect(await processNextBatch()).toMatchObject({ processed: 1, failed: 0 });
    expect(calls.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: "invoice", workspaceId: workspace }), expect.objectContaining({ id: "xero", workspaceId: workspace }), "AU");
  });
});
