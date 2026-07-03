/**
 * RA-6940 — enumeration guard on /api/auth/google-session.
 *
 * The endpoint must demand the short-lived gauth HMAC (issued by
 * /api/auth/google-signin) before disclosing any user data, and every
 * failure branch (missing token, invalid token, unknown user) must return
 * the identical generic body so responses cannot be used as an
 * account-existence oracle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const userFindUnique = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    securityEvent: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));

// lib/auth heavy deps — mocked so importing the real verifyGoogleAuthToken
// (via the route) doesn't drag in bcrypt/NextAuth internals.
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

import { POST } from "../google-session/route";

const SECRET = "test-secret-for-vitest-only";

function makeGauthToken(email: string, timestamp = Date.now()): string {
  const hmac = crypto
    .createHmac("sha256", SECRET)
    .update(`gauth:${email}:${timestamp}`)
    .digest("hex");
  return `gauth:${timestamp}:${hmac}`;
}

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/google-session", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  userFindUnique.mockReset();
  applyRateLimit.mockReset();
  applyRateLimit.mockResolvedValue(null);
  process.env.NEXTAUTH_SECRET = SECRET;
});

describe("POST /api/auth/google-session", () => {
  it("returns generic 401 with no user fields when no token is supplied", async () => {
    const res = await POST(makeReq({ email: "victim@example.com" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false });
    // Must not touch the database before proof-of-auth.
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns generic 401 for an invalid token", async () => {
    const res = await POST(
      makeReq({
        email: "victim@example.com",
        googleAuthToken: "gauth:123:deadbeef",
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns generic 401 for an expired token (older than 5 minutes)", async () => {
    const stale = Date.now() - 6 * 60 * 1000;
    const res = await POST(
      makeReq({
        email: "victim@example.com",
        googleAuthToken: makeGauthToken("victim@example.com", stale),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false });
  });

  it("returns a body identical to the invalid-token branch when the user does not exist (no oracle)", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const validTokenUnknownUser = await POST(
      makeReq({
        email: "nobody@example.com",
        googleAuthToken: makeGauthToken("nobody@example.com"),
      }),
    );
    const invalidToken = await POST(
      makeReq({
        email: "nobody@example.com",
        googleAuthToken: "gauth:123:deadbeef",
      }),
    );
    expect(validTokenUnknownUser.status).toBe(invalidToken.status);
    expect(await validTokenUnknownUser.json()).toEqual(
      await invalidToken.json(),
    );
  });

  it("rejects a token minted for a different email", async () => {
    const res = await POST(
      makeReq({
        email: "victim@example.com",
        googleAuthToken: makeGauthToken("attacker@example.com"),
      }),
    );
    expect(res.status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns the user when the token is valid and the user exists", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      email: "real@example.com",
      name: "Real User",
      role: "ADMIN",
      password: null,
    });
    const res = await POST(
      makeReq({
        email: "real@example.com",
        googleAuthToken: makeGauthToken("real@example.com"),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      user: {
        id: "u_1",
        email: "real@example.com",
        name: "Real User",
        role: "ADMIN",
      },
    });
  });

  it("applies a fail-closed rate limit", async () => {
    await POST(
      makeReq({
        email: "x@example.com",
        googleAuthToken: "gauth:123:deadbeef",
      }),
    );
    expect(applyRateLimit).toHaveBeenCalledTimes(1);
    const opts = applyRateLimit.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.failClosedOnUpstashError).toBe(true);
  });

  it("returns 429 when the rate limiter blocks the request", async () => {
    const { NextResponse } = await import("next/server");
    applyRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const res = await POST(
      makeReq({ email: "x@example.com", googleAuthToken: "whatever" }),
    );
    expect(res.status).toBe(429);
  });
});
