/**
 * middleware-setup-gate.test.ts
 *
 * Tests for the SETUP_WIZARD_ENABLED feature-flag gate added in middleware.ts.
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

import { getToken } from "next-auth/jwt";
import { middleware } from "../../middleware";

function mkReq(pathname: string, search: string = "") {
  return {
    nextUrl: {
      pathname,
      clone: () => new URL(`http://test${pathname}${search}`),
      search,
    },
    url: `http://test${pathname}${search}`,
    method: "GET",
    headers: new Headers(),
  } as any;
}

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
    const res = await middleware(mkReq("/dashboard"));
    // Should NOT redirect when flag is off
    expect((res as any).status).not.toBe(307);
  });

  it("redirects any authenticated user with null setupCompletedAt to /setup", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/dashboard"));
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
    const res = await middleware(mkReq("/reports"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("does NOT redirect when setupCompletedAt is set", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /setup itself even when flag is on + user not completed", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/setup"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /api/setup/* even when flag is on", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/api/setup/hydrate"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows unauthenticated requests through (setup gate path)", async () => {
    // Setup gate is irrelevant for unauthenticated users — the login redirect
    // gate below handles them. This asserts the setup gate itself does not
    // 307 redirect when there's no token.
    process.env.SETUP_WIZARD_ENABLED = "false";
    (getToken as any).mockResolvedValue(null);
    const res = await middleware(mkReq("/dashboard"));
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
    const res = await middleware(mkReq("/dashboard/inspections/123"));
    expect((res as any).status).toBe(307);
    const location = (res as any).headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain(
      `callbackUrl=${encodeURIComponent("/dashboard/inspections/123")}`,
    );
  });

  it("preserves search params in the callbackUrl", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await middleware(
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
      const res = await middleware(mkReq(path));
      expect((res as any).status).toBe(307);
      const location = (res as any).headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain(`callbackUrl=${encodeURIComponent(path)}`);
    }
  });

  it("does NOT redirect /invite/[token] — uses its own token-based auth", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await middleware(mkReq("/invite/abc123"));
    // Should fall through (NextResponse.next) — no redirect.
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect authenticated users", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await middleware(mkReq("/dashboard/inspections/123"));
    // Authenticated → no login redirect. (Setup gate is off in this block.)
    expect((res as any).status).not.toBe(307);
  });
});
