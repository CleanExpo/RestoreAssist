import { describe, it, expect, vi } from "vitest";
import { provisionTenantDb } from "../provision";

function deps(over: Partial<Parameters<typeof provisionTenantDb>[1]> = {}) {
  return {
    validate: vi.fn(() => ({ ok: true })),
    test: vi.fn(async () => true),
    migrate: vi.fn(async () => {}),
    store: vi.fn(async () => {}),
    markReady: vi.fn(async () => {}),
    ...over,
  };
}

const input = { workspaceId: "w1", connectionString: "postgres://ok" };

describe("provisionTenantDb", () => {
  it("runs validate→test→migrate→store→ready on the happy path", async () => {
    const d = deps();
    const r = await provisionTenantDb(input, d);
    expect(r).toEqual({ status: "ready", reachedPhase: "ready" });
    expect(d.validate).toHaveBeenCalledTimes(1);
    expect(d.test).toHaveBeenCalledTimes(1);
    expect(d.migrate).toHaveBeenCalledTimes(1);
    expect(d.store).toHaveBeenCalledTimes(1);
    expect(d.markReady).toHaveBeenCalledTimes(1);
  });

  it("stops at validate on a bad string and never stores", async () => {
    const d = deps({ validate: vi.fn(() => ({ ok: false, error: "not postgres" })) });
    const r = await provisionTenantDb(input, d);
    expect(r).toEqual({ status: "error", reachedPhase: "validate", error: "not postgres" });
    expect(d.test).not.toHaveBeenCalled();
    expect(d.store).not.toHaveBeenCalled();
  });

  it("stops at test on unreachable DB — no migrate, no store", async () => {
    const d = deps({ test: vi.fn(async () => false) });
    const r = await provisionTenantDb(input, d);
    expect(r.status).toBe("error");
    expect(r.reachedPhase).toBe("test");
    expect(d.migrate).not.toHaveBeenCalled();
    expect(d.store).not.toHaveBeenCalled();
  });

  it("stops at migrate on failure and never half-stores", async () => {
    const d = deps({ migrate: vi.fn(async () => { throw new Error("ddl blew up"); }) });
    const r = await provisionTenantDb(input, d);
    expect(r.status).toBe("error");
    expect(r.reachedPhase).toBe("migrate");
    expect(r.error).toMatch(/ddl blew up/);
    expect(d.store).not.toHaveBeenCalled();
    expect(d.markReady).not.toHaveBeenCalled();
  });

  it("resumes from a later phase, skipping the earlier ones (idempotent retry)", async () => {
    const d = deps();
    const r = await provisionTenantDb({ ...input, resumeFrom: "migrate" }, d);
    expect(r.status).toBe("ready");
    expect(d.validate).not.toHaveBeenCalled();
    expect(d.test).not.toHaveBeenCalled();
    expect(d.migrate).toHaveBeenCalledTimes(1);
    expect(d.store).toHaveBeenCalledTimes(1);
  });
});
