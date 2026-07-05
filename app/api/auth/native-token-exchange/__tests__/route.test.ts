import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const jwtVerify = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const encodeJwt = vi.fn();
const logSecurityEvent = vi.fn();

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "jwks"),
  jwtVerify: (...args: unknown[]) => jwtVerify(...args),
}));
vi.mock("next-auth/jwt", () => ({
  encode: (...args: unknown[]) => encodeJwt(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
  },
}));
vi.mock("@/lib/security-audit", () => ({
  extractRequestContext: vi.fn(() => ({ ip: "127.0.0.1" })),
  logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  jwtVerify.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  encodeJwt.mockReset();
  logSecurityEvent.mockReset();
  logSecurityEvent.mockResolvedValue(undefined);
});

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/native-token-exchange", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  provider: "google",
  idToken: "a".repeat(64),
};

const VALID_CLAIMS = {
  sub: "google_sub",
  email: "USER@EXAMPLE.COM",
  email_verified: true,
  name: "Test User",
  picture: null,
};

describe("POST /api/auth/native-token-exchange", () => {
  it("does not expose token verification exception details", async () => {
    jwtVerify.mockRejectedValueOnce(
      new Error("signature failed for kid internal-secret"),
    );

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "TOKEN_VERIFICATION_FAILED",
        message: "Token verification failed",
      },
    });
  });

  it("does not expose user create exception details", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockRejectedValueOnce(
      new Error("Unique constraint failed on internal_user_key"),
    );

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "USER_CREATE_FAILED",
        message: "User create failed",
      },
    });
  });

  it("does not expose session JWT encode exception details", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique
      .mockResolvedValueOnce({
        id: "user_1",
        email: "user@example.com",
        name: "Test User",
        image: null,
        role: "ADMIN",
        needsOnboarding: false,
      })
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockRejectedValueOnce(new Error("NEXTAUTH_SECRET invalid"));

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "JWT_ENCODE_FAILED",
        message: "Session JWT encode failed",
      },
    });
  });
});

// RA-2074 — "stay signed in" persistence contract.
//
// The tests above only exercise the error-masking paths. These lock the
// actual persistence guarantee for the iOS native OAuth flow: a successful
// exchange must Set-Cookie a *persistent* (90-day, httpOnly) session cookie
// carrying a rememberMe/customExp JWT. If SESSION_MAX_AGE_SECONDS drifts, the
// cookie loses its Max-Age (reverting to a session cookie that WKWebView
// purges on force-quit), or rememberMe/customExp regress, the iOS app silently
// stops "staying signed in" — the exact class of regression tracked in
// RA-2998. These assertions fail closed on any of those drifts.
const NINETY_DAYS_S = 90 * 24 * 60 * 60;

/** Locate the NextAuth session-token cookie on the response regardless of the
 *  `__Secure-` prefix (which depends on NODE_ENV at module load). */
function findSessionCookie(response: Awaited<ReturnType<typeof POST>>) {
  return response.cookies
    .getAll()
    .find((c) => /next-auth\.session-token$/.test(c.name));
}

describe("POST /api/auth/native-token-exchange — persistence contract", () => {
  const EXISTING_USER = {
    id: "user_1",
    email: "user@example.com",
    name: "Test User",
    image: null,
    role: "ADMIN",
    needsOnboarding: false,
  };

  it("issues a 90-day persistent httpOnly session cookie on successful redeem", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique
      .mockResolvedValueOnce(EXISTING_USER)
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockResolvedValueOnce("encoded.session.jwt");

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.isNewUser).toBe(false);
    // Existing user is redeemed, not re-created.
    expect(userCreate).not.toHaveBeenCalled();

    const cookie = findSessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe("encoded.session.jwt");
    // Persistent (has Max-Age) — not a session cookie WKWebView would purge.
    expect(cookie!.maxAge).toBe(NINETY_DAYS_S);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("lax");
    expect(cookie!.path).toBe("/");
  });

  it("encodes the session JWT with rememberMe=true and a ~90-day customExp", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique
      .mockResolvedValueOnce(EXISTING_USER)
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockResolvedValueOnce("encoded.session.jwt");

    const before = Math.floor(Date.now() / 1000);
    await POST(postRequest(VALID_BODY));
    const after = Math.floor(Date.now() / 1000);

    expect(encodeJwt).toHaveBeenCalledTimes(1);
    const encodeArgs = encodeJwt.mock.calls[0][0] as {
      token: Record<string, unknown>;
      secret: string;
      maxAge: number;
    };
    expect(encodeArgs.maxAge).toBe(NINETY_DAYS_S);
    expect(encodeArgs.token.sub).toBe(EXISTING_USER.id);
    expect(encodeArgs.token.rememberMe).toBe(true);
    const customExp = encodeArgs.token.customExp as number;
    expect(customExp).toBeGreaterThanOrEqual(before + NINETY_DAYS_S);
    expect(customExp).toBeLessThanOrEqual(after + NINETY_DAYS_S + 2);
  });

  it("creates the user then issues the persistent cookie on first native sign-in", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique
      .mockResolvedValueOnce(null) // no existing user → create
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    userCreate.mockResolvedValueOnce({
      ...EXISTING_USER,
      needsOnboarding: true,
    });
    encodeJwt.mockResolvedValueOnce("encoded.session.jwt");

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isNewUser).toBe(true);
    expect(userCreate).toHaveBeenCalledTimes(1);

    const cookie = findSessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie!.maxAge).toBe(NINETY_DAYS_S);
    expect(cookie!.httpOnly).toBe(true);
  });
});
