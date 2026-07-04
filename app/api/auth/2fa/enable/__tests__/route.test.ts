/**
 * RA-6966 — POST /api/auth/2fa/enable behavioural tests.
 *
 * Mocks only session/prisma/csrf/rate-limiter. @/lib/auth/two-factor runs
 * REAL (unmocked) — the "correct code" case generates an actual TOTP code
 * from an actual secret with the `otpauth` library and asserts the route
 * accepts it; the "wrong code" case asserts the real verifyToken rejects
 * it. This would fail if the real TOTP check were ever broken or bypassed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as OTPAuth from "otpauth";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function totpFor(secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "RestoreAssist",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

const secretBase32 = new OTPAuth.Secret({ size: 20 }).base32;

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  userUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  applyRateLimit.mockResolvedValue(null); // not rate-limited
  userUpdate.mockResolvedValue({});
});

describe("POST /api/auth/2fa/enable", () => {
  it("401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ code: "123456" }));

    expect(res.status).toBe(401);
  });

  it("429 when rate-limited", async () => {
    const { NextResponse } = await import("next/server");
    applyRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const res = await POST(makeRequest({ code: "123456" }));

    expect(res.status).toBe(429);
    // No code verification happens once the limit is hit.
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("rate-limits per user (session.user.id), not per IP", async () => {
    userFindUnique.mockResolvedValue({ twoFactorSecret: secretBase32 });

    await POST(makeRequest({ code: "123456" }));

    expect(applyRateLimit).toHaveBeenCalledTimes(1);
    const opts = applyRateLimit.mock.calls[0][1] as { key?: string };
    expect(opts.key).toBe("u1");
  });

  it("400 on a malformed code (not 6 digits)", async () => {
    userFindUnique.mockResolvedValue({ twoFactorSecret: secretBase32 });

    const res = await POST(makeRequest({ code: "abc" }));

    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("400 when no secret has been generated yet (setup not run)", async () => {
    userFindUnique.mockResolvedValue({ twoFactorSecret: null });

    const res = await POST(makeRequest({ code: "123456" }));

    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("400 on a wrong 6-digit code (real verifyToken rejects it)", async () => {
    userFindUnique.mockResolvedValue({ twoFactorSecret: secretBase32 });
    // 10 minutes away is outside the verify window — a genuinely wrong code.
    const wrongCode = totpFor(secretBase32).generate({
      timestamp: Date.now() + 10 * 60 * 1000,
    });

    const res = await POST(makeRequest({ code: wrongCode }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("200 on the correct code: enables 2FA and returns single-use recovery codes", async () => {
    userFindUnique.mockResolvedValue({ twoFactorSecret: secretBase32 });
    const validCode = totpFor(secretBase32).generate();

    const res = await POST(makeRequest({ code: validCode }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.recoveryCodes)).toBe(true);
    expect(json.recoveryCodes).toHaveLength(10);

    expect(userUpdate).toHaveBeenCalledTimes(1);
    const updateArg = userUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: {
        twoFactorEnabled: boolean;
        twoFactorEnabledAt: Date;
        twoFactorRecoveryCodes: string;
      };
    };
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(updateArg.data.twoFactorEnabled).toBe(true);
    expect(updateArg.data.twoFactorEnabledAt).toBeInstanceOf(Date);

    // Persisted hashes must not be the plaintext codes returned to the client.
    const persistedHashes = JSON.parse(updateArg.data.twoFactorRecoveryCodes);
    expect(persistedHashes).toHaveLength(10);
    for (const hash of persistedHashes) {
      expect(json.recoveryCodes).not.toContain(hash);
    }
  });
});
