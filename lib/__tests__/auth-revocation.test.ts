import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  securityEvent: {
    findFirst: vi.fn(),
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
  encryptAccountTokens: (account: unknown) => account,
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

const RECHECK_SECONDS = 24 * 60 * 60;
const RETRY_SECONDS = 5 * 60;
const NOW_SECONDS = Math.floor(
  new Date("2026-08-09T12:00:00.000Z").getTime() / 1000,
);

function validToken(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user_1",
    role: "ADMIN",
    mintedAt: NOW_SECONDS - 7 * 24 * 60 * 60,
    needsOnboarding: false,
    subscriptionStatus: "ACTIVE",
    trialEndsAt: null,
    lifetimeAccess: false,
    setupCompletedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function invokeJwt(token: Record<string, unknown>, trigger?: "update") {
  const jwtCallback = authOptions.callbacks?.jwt;
  if (!jwtCallback) throw new Error("jwt callback not found");
  return (jwtCallback as any)({ token, trigger });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_SECONDS * 1000));
  mockPrisma.securityEvent.findFirst.mockReset();
  mockPrisma.securityEvent.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("JWT session revocation rechecks", () => {
  it("stores the successful revocation-check timestamp", async () => {
    const result = await invokeJwt(validToken());

    expect(mockPrisma.securityEvent.findFirst).toHaveBeenCalledTimes(1);
    expect((result as any).revocationCheckedAt).toBe(NOW_SECONDS);
  });

  it("does not query again inside the bounded recheck interval", async () => {
    const checkedAt = NOW_SECONDS - RECHECK_SECONDS + 1;

    const result = await invokeJwt(
      validToken({ revocationCheckedAt: checkedAt }),
    );

    expect(mockPrisma.securityEvent.findFirst).not.toHaveBeenCalled();
    expect((result as any).revocationCheckedAt).toBe(checkedAt);
  });

  it("rechecks at the interval boundary and rejects a token minted before the event", async () => {
    mockPrisma.securityEvent.findFirst.mockResolvedValueOnce({
      createdAt: new Date((NOW_SECONDS - 60) * 1000),
    });

    const result = await invokeJwt(
      validToken({ revocationCheckedAt: NOW_SECONDS - RECHECK_SECONDS }),
    );

    expect(mockPrisma.securityEvent.findFirst).toHaveBeenCalledWith({
      where: { userId: "user_1", eventType: "SESSIONS_REVOKED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    expect((result as any).sub).toBeUndefined();
    expect((result as any).revoked).toBe(true);
  });

  it("keeps a token minted after the latest revocation event", async () => {
    mockPrisma.securityEvent.findFirst.mockResolvedValueOnce({
      createdAt: new Date((NOW_SECONDS - 2 * RECHECK_SECONDS) * 1000),
    });

    const result = await invokeJwt(
      validToken({
        mintedAt: NOW_SECONDS - RECHECK_SECONDS,
        revocationCheckedAt: NOW_SECONDS - RECHECK_SECONDS,
      }),
    );

    expect((result as any).sub).toBe("user_1");
    expect((result as any).revoked).toBeUndefined();
    expect((result as any).revocationCheckedAt).toBe(NOW_SECONDS);
  });

  it("forces a recheck on an explicit session update", async () => {
    await invokeJwt(validToken({ revocationCheckedAt: NOW_SECONDS }), "update");

    expect(mockPrisma.securityEvent.findFirst).toHaveBeenCalledTimes(1);
  });

  it("retries a failed revocation lookup after five minutes", async () => {
    mockPrisma.securityEvent.findFirst.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const token = validToken({
      revocationCheckedAt: NOW_SECONDS - RECHECK_SECONDS,
    });

    const failedResult = await invokeJwt(token);

    expect((failedResult as any).revocationRetryAt).toBe(
      NOW_SECONDS + RETRY_SECONDS,
    );
    mockPrisma.securityEvent.findFirst.mockClear();

    await invokeJwt(failedResult as any);
    expect(mockPrisma.securityEvent.findFirst).not.toHaveBeenCalled();

    vi.setSystemTime(new Date((NOW_SECONDS + RETRY_SECONDS) * 1000));
    const retryResult = await invokeJwt(failedResult as any);

    expect(mockPrisma.securityEvent.findFirst).toHaveBeenCalledTimes(1);
    expect((retryResult as any).revocationRetryAt).toBeUndefined();
    expect((retryResult as any).revocationCheckedAt).toBe(
      NOW_SECONDS + RETRY_SECONDS,
    );
  });
});
