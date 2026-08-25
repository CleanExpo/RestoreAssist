/**
 * lib/__tests__/auth-authorize-2fa.test.ts
 *
 * RA-6966 — lib/auth.ts:197 (NextAuth CredentialsProvider.authorize())
 * enforces TOTP / recovery-code verification once `twoFactorEnabled` is
 * true, but had no test asserting it. A prior bug class here ("password
 * matched -> session issued" without checking 2FA at all) would have
 * shipped silently.
 *
 * Unlike lib/__tests__/auth-remember-me.test.ts (which stubs the whole
 * CredentialsProvider factory to `{}` because it only exercises the
 * jwt/session callbacks), this test needs the REAL `authorize()` closure.
 * So `next-auth/providers/credentials` is mocked to pass its config
 * (including the real `authorize` function) straight through instead of
 * being replaced.
 *
 * `@/lib/auth/two-factor` is intentionally left UNMOCKED — TOTP codes are
 * generated with the real `otpauth` library against a real secret, and
 * recovery codes are minted with the real bcrypt-hash-backed generator, so
 * a broken TOTP check or a broken single-use recovery-code consumption
 * fails this test directly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));
const mockSecurityAudit = vi.hoisted(() => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  getAccountLockoutStatus: vi.fn().mockResolvedValue({ locked: false }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/apple", () => ({ default: vi.fn(() => ({})) }));
// Pass the credentials-provider config straight through so the real
// `authorize` closure survives onto authOptions.providers — the whole
// point of this test.
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => config,
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  encryptAccountTokens: (a: unknown) => a,
}));
vi.mock("@/lib/security-audit", () => mockSecurityAudit);
vi.mock("@/lib/billing/constants", () => ({ TRIAL_DAYS: 14 }));

import { authOptions } from "@/lib/auth";
import { generateRecoveryCodes } from "@/lib/auth/two-factor";

type AuthorizeFn = (
  credentials: Record<string, string>,
) => Promise<Record<string, unknown> | null>;

function getAuthorize(): AuthorizeFn {
  const provider = (authOptions.providers as unknown as Array<
    Record<string, unknown>
  >).find((p) => typeof p.authorize === "function");
  if (!provider) throw new Error("credentials provider not found on authOptions");
  return provider.authorize as AuthorizeFn;
}

const ISSUER = "RestoreAssist";
function totpFor(secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

describe("RA-6966 — lib/auth.ts authorize() 2FA gate (real two-factor logic)", () => {
  const PASSWORD = "correct horse battery staple 12";
  // Low bcrypt cost — this is a test fixture password, not a real secret.
  const passwordHash = bcrypt.hashSync(PASSWORD, 4);
  const secretBase32 = new OTPAuth.Secret({ size: 20 }).base32;

  function baseUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "u1",
      email: "tech@example.com",
      name: "Tech",
      image: null,
      role: "TECHNICIAN",
      password: passwordHash,
      twoFactorEnabled: true,
      twoFactorSecret: secretBase32,
      twoFactorRecoveryCodes: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockSecurityAudit.getAccountLockoutStatus.mockResolvedValue({
      locked: false,
    });
  });

  it("logs in with a valid TOTP code generated from the real secret", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    const validCode = totpFor(secretBase32).generate();

    const authorize = getAuthorize();
    const result = await authorize({
      email: "tech@example.com",
      password: PASSWORD,
      totp: validCode,
    });

    expect(result).toMatchObject({ id: "u1", email: "tech@example.com" });
  });

  it("rejects a wrong TOTP code with 2FA_INVALID", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    // A code minted 10 minutes away sits well outside the ±30s verify
    // window, so it is a genuinely wrong code, not a lucky guess.
    const wrongCode = totpFor(secretBase32).generate({
      timestamp: Date.now() + 10 * 60 * 1000,
    });

    const authorize = getAuthorize();
    await expect(
      authorize({
        email: "tech@example.com",
        password: PASSWORD,
        totp: wrongCode,
      }),
    ).rejects.toThrow("2FA_INVALID");
  });

  it("throws 2FA_REQUIRED when twoFactorEnabled and no code is supplied", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());

    const authorize = getAuthorize();
    await expect(
      authorize({ email: "tech@example.com", password: PASSWORD }),
    ).rejects.toThrow("2FA_REQUIRED");
  });

  it("returns null on a wrong password before the 2FA gate is ever reached", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    const validCode = totpFor(secretBase32).generate();

    const authorize = getAuthorize();
    const result = await authorize({
      email: "tech@example.com",
      password: "totally-wrong-password",
      totp: validCode,
    });

    expect(result).toBeNull();
  });

  it("recovery code is single-use: accepted once, then rejected on replay", async () => {
    const { plain, hashed } = await generateRecoveryCodes();
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ twoFactorRecoveryCodes: JSON.stringify(hashed) }),
    );

    const authorize = getAuthorize();
    const firstAttempt = await authorize({
      email: "tech@example.com",
      password: PASSWORD,
      totp: plain[0],
    });
    expect(firstAttempt).toMatchObject({ id: "u1" });

    // authorize() must persist the shrunk recovery-code array so the used
    // code can never be replayed.
    expect(mockPrisma.user.updateMany).toHaveBeenCalledTimes(1);
    const updateArg = mockPrisma.user.updateMany.mock.calls[0][0] as {
      data: { twoFactorRecoveryCodes: string };
    };
    const persisted = JSON.parse(updateArg.data.twoFactorRecoveryCodes);
    expect(persisted).toHaveLength(hashed.length - 1);
    expect(persisted).not.toContain(hashed[0]);

    // Next login reads back the persisted (shrunk) codes from the DB.
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ twoFactorRecoveryCodes: JSON.stringify(persisted) }),
    );

    await expect(
      authorize({
        email: "tech@example.com",
        password: PASSWORD,
        totp: plain[0],
      }),
    ).rejects.toThrow("2FA_INVALID");
  });

  it("allows only one concurrent claimant for a recovery-code snapshot", async () => {
    const { plain, hashed } = await generateRecoveryCodes();
    const snapshot = JSON.stringify(hashed);
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ twoFactorRecoveryCodes: snapshot }),
    );
    mockPrisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const authorize = getAuthorize();
    const attempts = await Promise.allSettled([
      authorize({ email: "tech@example.com", password: PASSWORD, totp: plain[0] }),
      authorize({ email: "tech@example.com", password: PASSWORD, totp: plain[0] }),
    ]);

    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "2FA_INVALID" }),
    });
    expect(mockPrisma.user.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.updateMany.mock.calls[0][0].where).toEqual({
      id: "u1",
      twoFactorRecoveryCodes: snapshot,
    });
  });

  it("does not enforce 2FA at all when twoFactorEnabled is false", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ twoFactorEnabled: false, twoFactorSecret: null }),
    );

    const authorize = getAuthorize();
    const result = await authorize({
      email: "tech@example.com",
      password: PASSWORD,
    });

    expect(result).toMatchObject({ id: "u1" });
  });

  it("uses one canonical identity for mixed-case credential lookup and lockout", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ twoFactorEnabled: false, twoFactorSecret: null }),
    );

    const result = await getAuthorize()({
      email: "  TeCh@Example.COM  ",
      password: PASSWORD,
    });

    expect(result).toMatchObject({ id: "u1", email: "tech@example.com" });
    expect(mockSecurityAudit.getAccountLockoutStatus).toHaveBeenCalledWith({
      email: "tech@example.com",
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "tech@example.com" },
    });
  });

  it("verifies a Google HMAC against the raw signed email before canonical lookup", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ twoFactorEnabled: false, twoFactorSecret: null }),
    );
    const originalSecret = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "mixed-case-hmac-test-secret";
    const submittedEmail = "TeCh@Example.COM";
    const timestamp = Date.now().toString();
    const hmac = crypto
      .createHmac("sha256", process.env.NEXTAUTH_SECRET)
      .update(`gauth:${submittedEmail}:${timestamp}`)
      .digest("hex");

    try {
      const result = await getAuthorize()({
        email: submittedEmail,
        password: `gauth:${timestamp}:${hmac}`,
      });

      expect(result).toMatchObject({ id: "u1" });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "tech@example.com" },
      });
    } finally {
      if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = originalSecret;
    }
  });
});
