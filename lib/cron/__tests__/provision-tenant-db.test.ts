import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controllable fake deps so the REAL provisionTenantDb state machine runs, but
// the DB-touching side effects (test/migrate/store/markReady) are faked — no
// live database. This is "the provision orchestration with its deps mocked".
const h = vi.hoisted(() => ({
  deps: {
    validate: vi.fn(() => ({ ok: true }) as { ok: boolean; error?: string }),
    test: vi.fn(async () => true),
    migrate: vi.fn(async () => {}),
    store: vi.fn(async () => {}),
    markReady: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/tenant/provision-deps", () => ({ buildProvisionDeps: () => h.deps }));
vi.mock("@/lib/credential-vault", () => ({
  decrypt: vi.fn(() => "postgres://t:pw@tenant-host:5432/acme"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { workspace: { findMany: vi.fn(), update: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { provisionPendingTenantDbs } from "../provision-tenant-db";

const ws = (prisma as unknown as {
  workspace: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}).workspace;

beforeEach(() => {
  vi.clearAllMocks();
  ws.update.mockResolvedValue({});
  h.deps.validate.mockReturnValue({ ok: true });
  h.deps.test.mockResolvedValue(true);
  h.deps.migrate.mockResolvedValue(undefined);
  h.deps.store.mockResolvedValue(undefined);
  h.deps.markReady.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

const pending = (over: Record<string, unknown> = {}) => ({
  id: "w1",
  tenantDbConnectionEnc: "enc:blob",
  tenantDbProvisionPhase: null,
  ...over,
});

describe("provisionPendingTenantDbs — worker", () => {
  it("runs every phase and flips to ready on the happy path", async () => {
    ws.findMany.mockResolvedValueOnce([pending()]);

    const r = await provisionPendingTenantDbs();

    expect(h.deps.validate).toHaveBeenCalledTimes(1);
    expect(h.deps.test).toHaveBeenCalledTimes(1);
    expect(h.deps.migrate).toHaveBeenCalledTimes(1);
    expect(h.deps.store).toHaveBeenCalledTimes(1);
    expect(h.deps.markReady).toHaveBeenCalledTimes(1);
    // markReady (the dep) owns the ready flip — the worker must not also write.
    expect(ws.update).not.toHaveBeenCalled();
    expect(r.itemsProcessed).toBe(1);
    expect(r.metadata?.ready).toBe(1);
  });

  it("records error + the failed phase when connectivity fails", async () => {
    ws.findMany.mockResolvedValueOnce([pending()]);
    h.deps.test.mockResolvedValue(false);

    const r = await provisionPendingTenantDbs();

    expect(h.deps.migrate).not.toHaveBeenCalled();
    expect(ws.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { tenantDbStatus: "error", tenantDbProvisionPhase: "test" },
    });
    expect(r.metadata?.errored).toBe(1);
  });

  it("records error + phase=migrate when the baseline migration fails", async () => {
    ws.findMany.mockResolvedValueOnce([pending()]);
    h.deps.migrate.mockRejectedValue(new Error("Tenant baseline migration failed."));

    await provisionPendingTenantDbs();

    expect(h.deps.store).not.toHaveBeenCalled();
    expect(h.deps.markReady).not.toHaveBeenCalled();
    expect(ws.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { tenantDbStatus: "error", tenantDbProvisionPhase: "migrate" },
    });
  });

  it("resumes from the stored phase, skipping earlier phases", async () => {
    ws.findMany.mockResolvedValueOnce([pending({ tenantDbProvisionPhase: "migrate" })]);

    const r = await provisionPendingTenantDbs();

    expect(h.deps.validate).not.toHaveBeenCalled();
    expect(h.deps.test).not.toHaveBeenCalled();
    expect(h.deps.migrate).toHaveBeenCalledTimes(1);
    expect(h.deps.markReady).toHaveBeenCalledTimes(1);
    expect(r.metadata?.ready).toBe(1);
  });

  it("only ever selects provisioning/error workspaces — never ready (idempotent)", async () => {
    ws.findMany.mockResolvedValueOnce([]);

    const r = await provisionPendingTenantDbs();

    const arg = ws.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantDbStatus: { in: ["provisioning", "error"] } });
    expect(typeof arg.take).toBe("number");
    expect(r.itemsProcessed).toBe(0);
    expect(r.metadata?.reason).toBe("no-pending-workspaces");
  });

  it("pins a workspace with no stored connection string to error without running phases", async () => {
    ws.findMany.mockResolvedValueOnce([pending({ tenantDbConnectionEnc: null })]);

    await provisionPendingTenantDbs();

    expect(h.deps.test).not.toHaveBeenCalled();
    expect(ws.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { tenantDbStatus: "error", tenantDbProvisionPhase: "validate" },
    });
  });
});

describe("cron route — CRON auth fail-closed", () => {
  const ORIGINAL = process.env.CRON_SECRET;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL;
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/provision-tenant-db/route");
    const req = { headers: { get: () => "" } } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req);
    expect(res.status).toBe(401);
    // Must not have run the worker when auth fails closed.
    expect(ws.findMany).not.toHaveBeenCalled();
  });
});
