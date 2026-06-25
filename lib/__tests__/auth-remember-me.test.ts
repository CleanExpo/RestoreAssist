/**
 * auth-remember-me.test.ts
 *
 * RA-2074 — Verify that the NextAuth session configuration stamps persistent
 * cookies and that the JWT callback applies the correct customExp lifetime
 * based on the rememberMe flag / OAuth provider.
 *
 * Tests avoid real Prisma / bcrypt calls by mocking all heavy deps.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoist mocks before authOptions import ──────────────────────────────────

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

const NINETY_DAYS_S = 90 * 24 * 60 * 60;
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

describe("RA-2074 — persistent sign-in session configuration", () => {
  it("session maxAge is 90 days (upper bound for iOS stay-signed-in)", () => {
    expect(authOptions.session?.maxAge).toBe(NINETY_DAYS_S);
  });

  it("session cookie maxAge matches session maxAge (WKWebView persistent cookie)", () => {
    const cookieMaxAge = authOptions.cookies?.sessionToken?.options?.maxAge;
    expect(cookieMaxAge).toBe(NINETY_DAYS_S);
  });

  it("session strategy is jwt (required for customExp enforcement)", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });
});

describe("RA-2074 — JWT customExp stamping on first sign-in", () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  const invokeJwt = async (
    user: Record<string, unknown>,
    account?: Record<string, unknown>,
  ) => {
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) throw new Error("jwt callback not found on authOptions");
    return jwtCallback({
      token: {} as any,
      user: user as any,
      account: account as any,
      trigger: "signIn",
    });
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      needsOnboarding: false,
      role: "TECHNICIAN",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      lifetimeAccess: false,
      organization: null,
    });
    mockPrisma.securityEvent.findFirst.mockResolvedValue(null);
  });

  it("rememberMe=true stamps customExp ~90 days out", async () => {
    const before = nowSeconds();
    const token = await invokeJwt({
      id: "u1",
      rememberMe: true,
      role: "TECHNICIAN",
    });
    const after = nowSeconds();

    const customExp = (token as any).customExp as number;
    expect(customExp).toBeGreaterThanOrEqual(before + NINETY_DAYS_S);
    expect(customExp).toBeLessThanOrEqual(after + NINETY_DAYS_S + 2);
    expect((token as any).rememberMe).toBe(true);
  });

  it("rememberMe=false stamps customExp ~7 days out", async () => {
    const before = nowSeconds();
    const token = await invokeJwt({
      id: "u1",
      rememberMe: false,
      role: "TECHNICIAN",
    });
    const after = nowSeconds();

    const customExp = (token as any).customExp as number;
    expect(customExp).toBeGreaterThanOrEqual(before + SEVEN_DAYS_S);
    expect(customExp).toBeLessThanOrEqual(after + SEVEN_DAYS_S + 2);
    expect((token as any).rememberMe).toBe(false);
  });

  it("OAuth sign-in (Google) defaults to 90-day lifetime regardless of rememberMe", async () => {
    const before = nowSeconds();
    const token = await invokeJwt(
      { id: "u1", role: "TECHNICIAN" },
      { provider: "google" },
    );
    const after = nowSeconds();

    const customExp = (token as any).customExp as number;
    expect(customExp).toBeGreaterThanOrEqual(before + NINETY_DAYS_S);
    expect(customExp).toBeLessThanOrEqual(after + NINETY_DAYS_S + 2);
  });
});

describe("RA-2074 — session callback customExp enforcement", () => {
  const invokeSession = async (tokenOverrides: Record<string, unknown>) => {
    const sessionCallback = authOptions.callbacks?.session;
    if (!sessionCallback)
      throw new Error("session callback not found on authOptions");
    const baseSession = {
      user: { id: "u1", email: "tech@example.com", name: "Tech" },
      expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    };
    return sessionCallback({
      session: baseSession as any,
      token: { sub: "u1", ...tokenOverrides } as any,
    });
  };

  it("returns user identity when customExp is in the future", async () => {
    const future = Math.floor(Date.now() / 1000) + 1000;
    const result = await invokeSession({
      customExp: future,
      role: "TECHNICIAN",
    });
    expect((result as any).user?.id).toBe("u1");
  });

  it("strips user identity when customExp is in the past (expired session)", async () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    const result = await invokeSession({ customExp: past });
    expect((result as any).user).toBeUndefined();
  });
});
