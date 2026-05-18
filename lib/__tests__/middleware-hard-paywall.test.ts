/**
 * middleware-hard-paywall.test.ts
 *
 * RA-4984 — JWT-claim-driven hard-paywall in middleware. Restores
 * SP-3 T15 behaviour without Prisma so the check survives edge runtime.
 *
 * The middleware reads subscriptionStatus / trialEndsAt / lifetimeAccess
 * directly from the JWT (stamped in lib/auth.ts jwt()). When the user's
 * claims indicate trial expiry / cancellation / past-due AND the path
 * is not on the whitelist (e.g. /pricing, /billing/upgrade), middleware
 * issues a 307 to /billing/upgrade?reason=trial-expired.
 *
 * Allowlist (NOT blocked):
 *   - lifetimeAccess === true
 *   - subscriptionStatus === "ACTIVE"
 *   - subscriptionStatus === "TRIAL" with trialEndsAt unset or in the future
 *
 * Block: TRIAL+expired, CANCELED, EXPIRED, PAST_DUE.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getToken } from "next-auth/jwt";
import { middleware } from "../../middleware";

const mockGetToken = vi.mocked(getToken);

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

function baseToken(overrides: Record<string, unknown> = {}) {
  return {
    sub: "u1",
    setupCompletedAt: "2026-01-01T00:00:00Z",
    needsOnboarding: false,
    ...overrides,
  };
}

describe("middleware hard-paywall (RA-4984 / SP-3 T15)", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    process.env.SETUP_WIZARD_ENABLED = "false";
  });

  it("redirects expired TRIAL user to /billing/upgrade?reason=trial-expired", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: yesterday }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain(
      "/billing/upgrade?reason=trial-expired",
    );
  });

  it("does NOT redirect ACTIVE user even with expired trialEndsAt", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "ACTIVE", trialEndsAt: yesterday }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect TRIAL user with future trialEndsAt", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: tomorrow }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect lifetimeAccess user regardless of status", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({
        subscriptionStatus: "CANCELED",
        lifetimeAccess: true,
      }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("redirects CANCELED user", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain(
      "/billing/upgrade?reason=trial-expired",
    );
  });

  it("redirects PAST_DUE user", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "PAST_DUE" }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
  });

  it("does NOT redirect whitelisted path /pricing even when blocked", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );
    const res = await middleware(mkReq("/pricing"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect whitelisted path /billing/upgrade", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );
    const res = await middleware(mkReq("/billing/upgrade"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect when subscriptionStatus is missing (legacy JWT — fail-open)", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: undefined }) as any,
    );
    const res = await middleware(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });
});
