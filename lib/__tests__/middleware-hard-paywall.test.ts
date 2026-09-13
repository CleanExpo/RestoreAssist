/**
 * middleware-hard-paywall.test.ts
 *
 * RA-4984 — JWT-claim-driven hard-paywall in middleware. Restores
 * SP-3 T15 behaviour without Prisma so the check survives edge runtime.
 *
 * The middleware reads subscriptionStatus / trialEndsAt / lifetimeAccess
 * directly from the JWT (stamped in lib/auth.ts jwt()).
 *
 * RA-7439 / RA-7462 — expired trial (TRIAL past trialEndsAt, or EXPIRED
 * after the sweep) KEEPS the dashboard. The wall is at report creation.
 * Cancelled / past-due paid accounts still 307 to /billing/upgrade.
 *
 * Allowlist (NOT blocked):
 *   - lifetimeAccess === true
 *   - subscriptionStatus === "ACTIVE"
 *   - subscriptionStatus === "TRIAL" (active or expired)
 *   - subscriptionStatus === "EXPIRED"
 *
 * Block: CANCELED, PAST_DUE.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getToken } from "next-auth/jwt";
import { proxy } from "../../proxy";

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

  it("does NOT redirect an expired TRIAL user away from the dashboard (RA-7439)", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: yesterday }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
    expect((res as any).headers.get("location")).toBeNull();
  });

  it("does NOT redirect an expired trial on nested dashboard routes", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: yesterday }) as any,
    );

    const res = await proxy(mkReq("/dashboard/inspections"));

    expect((res as any).status).not.toBe(307);
    expect((res as any).headers.get("location")).toBeNull();
  });

  it("does NOT redirect after the trial status flips to EXPIRED", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "EXPIRED", trialEndsAt: yesterday }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
    expect((res as any).headers.get("location")).toBeNull();
  });

  it("does NOT redirect ACTIVE user even with expired trialEndsAt", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "ACTIVE", trialEndsAt: yesterday }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect TRIAL user with future trialEndsAt", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: tomorrow }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect lifetimeAccess user regardless of status", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({
        subscriptionStatus: "CANCELED",
        lifetimeAccess: true,
      }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("redirects CANCELED user", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain(
      "/billing/upgrade?reason=trial-expired",
    );
  });

  it("redirects PAST_DUE user", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "PAST_DUE" }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
  });

  it("does NOT redirect whitelisted path /pricing even when blocked", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );
    const res = await proxy(mkReq("/pricing"));
    expect((res as any).status).not.toBe(307);
  });

  it("does NOT redirect whitelisted path /billing/upgrade", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );
    const res = await proxy(mkReq("/billing/upgrade"));
    expect((res as any).status).not.toBe(307);
  });

  it("keeps the subscription remedy reachable for an expired trial", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: yesterday }) as any,
    );

    const res = await proxy(mkReq("/dashboard/subscription"));
    expect((res as any).status).not.toBe(307);
    expect((res as any).headers.get("location")).toBeNull();
  });

  it("keeps the checkout fulfillment return reachable for an expired trial", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "TRIAL", trialEndsAt: yesterday }) as any,
    );

    const res = await proxy(mkReq("/dashboard/success"));
    expect((res as any).status).not.toBe(307);
    expect((res as any).headers.get("location")).toBeNull();
  });

  it("does not whitelist a subscription-prefixed sibling", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: "CANCELED" }) as any,
    );

    const res = await proxy(mkReq("/dashboard/subscription-audit"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/billing/upgrade");
  });

  it("does NOT redirect when subscriptionStatus is missing (legacy JWT — fail-open)", async () => {
    mockGetToken.mockResolvedValue(
      baseToken({ subscriptionStatus: undefined }) as any,
    );
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });
});
