/**
 * middleware-setup-gate.test.ts
 *
 * Tests for the SETUP_WIZARD_ENABLED feature-flag gate added in middleware.ts.
 * The gate redirects OWNER/ADMIN users without setupCompletedAt to /setup,
 * and TECHNICIAN users without techOnboardedAt to /onboarding/technician.
 *
 * This file lives in lib/__tests__/ so vitest picks it up via the existing
 * include pattern for lib tests.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Must mock before importing middleware so the module-level import of
// next-auth/jwt resolves to the mock.
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getToken } from "next-auth/jwt";
import { middleware } from "../../middleware";

function mkReq(pathname: string) {
  const url = new URL(`http://test${pathname}`);
  return {
    nextUrl: {
      pathname,
      clone: () => new URL(`http://test${pathname}`),
      search: "",
    },
    url: `http://test${pathname}`,
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
      role: "OWNER",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/dashboard"));
    // Should NOT redirect when flag is off
    expect((res as any).status).not.toBe(307);
  });

  it("redirects OWNER without setupCompletedAt to /setup when flag is on", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      role: "OWNER",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("does NOT redirect when setupCompletedAt is set", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      role: "OWNER",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /setup itself even when flag is on + user not completed", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      role: "OWNER",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/setup"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /api/setup/* even when flag is on", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      role: "OWNER",
      setupCompletedAt: null,
    });
    const res = await middleware(mkReq("/api/setup/hydrate"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows unauthenticated requests through", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });
});
