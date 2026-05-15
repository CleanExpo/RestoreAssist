/**
 * middleware-hard-paywall.test.ts
 *
 * SP-3 T15 — hard-paywall redirect for expired trials.
 *
 * When `getTrialStatus(token.sub).showHardWall === true` and the request
 * isn't on the hard-paywall whitelist, middleware redirects (307) to
 * /billing/upgrade?reason=trial-expired.
 *
 * Lives in lib/__tests__/ so vitest picks it up via the existing include
 * pattern. Follows the mock-shape conventions from middleware-setup-gate.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocks must be declared before importing middleware so module-level
// imports inside middleware.ts resolve to the mocks.
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/trial-handling", () => ({ getTrialStatus: vi.fn() }));

import { getToken } from "next-auth/jwt";
import { getTrialStatus } from "@/lib/trial-handling";
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

describe("middleware hard-paywall (SP-3 T15)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Isolate hard-paywall logic — keep setup gate off so its 307 doesn't
    // mask the assertions here.
    process.env.SETUP_WIZARD_ENABLED = "false";
  });

  it("redirects expired TRIAL user to /billing/upgrade?reason=trial-expired", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    (getTrialStatus as any).mockResolvedValue({
      showHardWall: true,
      hasTrialExpired: true,
      subscriptionStatus: "TRIAL",
    });
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain(
      "/billing/upgrade?reason=trial-expired",
    );
  });

  it("does NOT redirect ACTIVE user even with expired trialEndsAt", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    (getTrialStatus as any).mockResolvedValue({
      showHardWall: false,
      hasTrialExpired: true,
      subscriptionStatus: "ACTIVE",
    });
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect whitelisted path /pricing", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    (getTrialStatus as any).mockResolvedValue({ showHardWall: true });
    const res = await middleware(mkReq("/pricing"));
    expect((res as any).status).not.toBe(307);
  });
});
