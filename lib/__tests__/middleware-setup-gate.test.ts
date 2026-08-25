/**
 * middleware-setup-gate.test.ts
 *
 * Tests for the SETUP_WIZARD_ENABLED feature-flag gate in proxy.ts.
 * The gate redirects any authenticated user without setupCompletedAt to /setup.
 * Role-agnostic: no OWNER/TECHNICIAN/ADMIN branching (C1+C3 fix).
 *
 * This file lives in lib/__tests__/ so vitest picks it up via the existing
 * include pattern for lib tests.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Must mock before importing middleware so the module-level import of
// next-auth/jwt resolves to the mock.
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
// SP-3 T15 added a hard-paywall block that calls getTrialStatus when an
// authenticated user lands on a non-whitelisted path. Mock it here so this
// suite stays Prisma-free.
vi.mock("@/lib/trial-handling", () => ({
  getTrialStatus: vi.fn().mockResolvedValue({ showHardWall: false }),
}));

import { getToken } from "next-auth/jwt";
import { proxy } from "../../proxy";

function mkReq(pathname: string, search: string = "") {
  const parsed = new URL(`http://test${pathname}${search}`);
  return {
    nextUrl: {
      pathname,
      clone: () => new URL(`http://test${pathname}${search}`),
      search,
      searchParams: parsed.searchParams,
    },
    url: `http://test${pathname}${search}`,
    method: "GET",
    headers: new Headers(),
  } as any;
}

describe("legacy invitation signup compatibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SETUP_WIZARD_ENABLED = "false";
  });

  it("redirects one valid legacy invitation token to the canonical invite route", async () => {
    const token = "a".repeat(48);
    const res = await proxy(mkReq("/signup", `?invite=${token}&utm_source=legacy`));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://test/invite/${token}`);
    expect(getToken).not.toHaveBeenCalled();
  });

  it.each([
    ["short token", "?invite=abc"],
    ["empty token", "?invite="],
    ["duplicate tokens", `?invite=${"a".repeat(48)}&invite=${"b".repeat(48)}`],
  ])("fails closed on %s without returning to account creation", async (_case, search) => {
    const res = await proxy(mkReq("/signup", search));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://test/invite/invalid");
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe("middleware setup gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SETUP_WIZARD_ENABLED = "true";
  });

  it("is inert when SETUP_WIZARD_ENABLED is not true", async () => {
    process.env.SETUP_WIZARD_ENABLED = "false";
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/dashboard"));
    // Should NOT redirect when flag is off
    expect((res as any).status).not.toBe(307);
  });

  it("redirects any authenticated user with null setupCompletedAt to /setup", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("ADMIN with null setupCompletedAt is redirected to /setup (C1 regression)", async () => {
    // Regression for C1: ADMIN must be gated same as any other role.
    // Old code relied on role === "OWNER" || role === "ADMIN" — "OWNER" doesn't
    // exist in the schema, making that branch partially dead. New code is
    // role-agnostic so ADMIN is covered by the generic setupCompletedAt check.
    (getToken as any).mockResolvedValue({
      sub: "u2",
      role: "ADMIN",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/reports"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("does NOT redirect when setupCompletedAt is set", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /setup itself even when flag is on + user not completed", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/setup"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /api/setup/* even when flag is on", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/api/setup/hydrate"));
    expect((res as any).status).not.toBe(307);
  });

  // P1 #16 added an unauth → /login redirect that runs BEFORE the setup
  // gate. For an unauthenticated request to /dashboard, middleware now
  // (correctly) returns a 307 to /login — but that 307 is from the login
  // redirect, not the setup gate. To assert the setup gate's own
  // pass-through behaviour, the test now uses an AUTHENTICATED token with
  // setup already complete + the flag disabled. That isolates the
  // setup-gate codepath cleanly.
  it("does not 307 when setup is complete (setup gate path)", async () => {
    process.env.SETUP_WIZARD_ENABLED = "false";
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });
});

describe("middleware login redirect (P1 #16)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Setup gate off so we isolate the login-redirect logic.
    process.env.SETUP_WIZARD_ENABLED = "false";
  });

  it("redirects unauthenticated /dashboard/* requests to /login with callbackUrl", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(mkReq("/dashboard/inspections/123"));
    expect((res as any).status).toBe(307);
    const location = (res as any).headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain(
      `callbackUrl=${encodeURIComponent("/dashboard/inspections/123")}`,
    );
  });

  it("preserves search params in the callbackUrl", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(
      mkReq("/dashboard/inspections", "?tab=open&page=2"),
    );
    expect((res as any).status).toBe(307);
    const location = (res as any).headers.get("location");
    expect(location).toContain(
      `callbackUrl=${encodeURIComponent("/dashboard/inspections?tab=open&page=2")}`,
    );
  });

  it("redirects /reports/* and /compliance/* and /sign/* similarly", async () => {
    (getToken as any).mockResolvedValue(null);
    for (const path of ["/reports/42", "/compliance", "/sign/abc"]) {
      const res = await proxy(mkReq(path));
      expect((res as any).status).toBe(307);
      const location = (res as any).headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain(`callbackUrl=${encodeURIComponent(path)}`);
    }
  });

  it("does NOT redirect /invite/[token] — uses its own token-based auth", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(mkReq("/invite/abc123"));
    // Should fall through (NextResponse.next) — no redirect.
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect authenticated users", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await proxy(mkReq("/dashboard/inspections/123"));
    // Authenticated → no login redirect. (Setup gate is off in this block.)
    expect((res as any).status).not.toBe(307);
  });
});
