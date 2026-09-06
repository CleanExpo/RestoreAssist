/**
 * RA-1259 — JWT `needsOnboarding` must re-read the DB while the gate is
 * still closed. Middleware (`proxy.ts`) uses getToken(), so a stale
 * `true` claim bounces every /dashboard click back to
 * /onboarding/account-type even after POST /api/onboarding/account-type
 * has already persisted `needsOnboarding: false`.
 *
 * NextAuth only sets trigger="update" on an explicit session POST.
 * Routine session GETs (SessionProvider, getSession) call jwt() without
 * that trigger. If we only refresh when the claim is undefined, a
 * completed onboarding never unsticks the cookie.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  securityEvent: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
}));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/apple", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(() => ({})),
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  encryptAccountTokens: (a: unknown) => a,
}));
vi.mock("@/lib/auth/two-factor", () => ({
  verifyToken: vi.fn(),
  parseRecoveryCodes: vi.fn(() => []),
  serializeRecoveryCodes: vi.fn(),
  consumeRecoveryCode: vi.fn(),
  looksLikeRecoveryCode: vi.fn(() => false),
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: vi.fn(),
  getAccountLockoutStatus: vi.fn().mockResolvedValue({ locked: false }),
}));
vi.mock("@/lib/billing/constants", () => ({ TRIAL_DAYS: 14 }));

import { authOptions } from "@/lib/auth";

async function invokeJwt(
  token: Record<string, unknown>,
  extras: {
    user?: Record<string, unknown>;
    trigger?: "signIn" | "update";
    account?: Record<string, unknown>;
  } = {},
) {
  const jwtCallback = authOptions.callbacks?.jwt;
  if (!jwtCallback) throw new Error("jwt callback not found on authOptions");
  return jwtCallback({
    token: token as never,
    user: extras.user as never,
    account: extras.account as never,
    trigger: extras.trigger,
  });
}

describe("RA-1259 — JWT needsOnboarding refresh while the gate is closed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.securityEvent.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      needsOnboarding: false,
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date(Date.now() + 86_400_000),
      lifetimeAccess: false,
      organization: null,
    });
  });

  function settledToken(overrides: Record<string, unknown> = {}) {
    return {
      sub: "u1",
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      setupCompletedAt: "2026-01-01T00:00:00.000Z",
      revocationCheckedAt: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  }

  it("clears a stale true claim on a routine session read after onboarding is saved", async () => {
    const token = await invokeJwt(
      settledToken({ needsOnboarding: true }),
    );

    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    expect((token as { needsOnboarding?: boolean }).needsOnboarding).toBe(
      false,
    );
  });

  it("does not re-query the user row when the gate is already open", async () => {
    const token = await invokeJwt(
      settledToken({ needsOnboarding: false }),
    );

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect((token as { needsOnboarding?: boolean }).needsOnboarding).toBe(
      false,
    );
  });
});
