import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const jwtVerify = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const encodeJwt = vi.fn();
const logSecurityEvent = vi.fn();
const userInviteFindFirst = vi.fn();
const executeRaw = vi.fn();
const nonceUpdateMany = vi.fn();
const nonceFindFirst = vi.fn();
const accountFindUnique = vi.fn();
const accountCreate = vi.fn();
const applyRateLimit = vi.fn();

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "jwks"),
  jwtVerify: (...args: unknown[]) => jwtVerify(...args),
}));
vi.mock("next-auth/jwt", () => ({
  encode: (...args: unknown[]) => encodeJwt(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: (...args: unknown[]) => executeRaw(...args),
        userInvite: {
          findFirst: (...args: unknown[]) => userInviteFindFirst(...args),
        },
        account: {
          findUnique: (...args: unknown[]) => accountFindUnique(...args),
          create: (...args: unknown[]) => accountCreate(...args),
        },
        user: {
          findUnique: (...args: unknown[]) => userFindUnique(...args),
          create: (...args: unknown[]) => userCreate(...args),
        },
      }),
    nativeAuthNonce: {
      findFirst: (...args: unknown[]) => nonceFindFirst(...args),
      updateMany: (...args: unknown[]) => nonceUpdateMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
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
  userInviteFindFirst.mockReset();
  userInviteFindFirst.mockResolvedValue(null);
  executeRaw.mockReset();
  executeRaw.mockResolvedValue(1);
  nonceUpdateMany.mockReset();
  nonceUpdateMany.mockResolvedValue({ count: 1 });
  nonceFindFirst.mockReset();
  nonceFindFirst.mockResolvedValue({ id: "nonce-1" });
  accountFindUnique.mockReset();
  accountFindUnique.mockResolvedValue(null);
  accountCreate.mockReset();
  accountCreate.mockResolvedValue({ id: "account-1" });
  applyRateLimit.mockReset();
  applyRateLimit.mockResolvedValue(null);
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
  nonce: "native-client-nonce",
};

const VALID_CLAIMS = {
  sub: "google_sub",
  email: "USER@EXAMPLE.COM",
  email_verified: true,
  name: "Test User",
  picture: null,
  nonce: "native-client-nonce",
};

describe("POST /api/auth/native-token-exchange", () => {
  it("accepts the configured Android Web client as a Google token audience", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID =
      "123456789-android-web.apps.googleusercontent.com";
    jwtVerify.mockRejectedValueOnce(new Error("stop after options capture"));

    try {
      await POST(postRequest(VALID_BODY));
      const options = jwtVerify.mock.calls[0][2] as { audience: string[] };
      expect(options.audience).toContain(
        "123456789-android-web.apps.googleusercontent.com",
      );
    } finally {
      delete process.env.NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID;
    }
  });

  it("never accepts an Android OAuth placeholder as a token audience", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID =
      "TODO-from-google-cloud-console-web-client-id";
    jwtVerify.mockRejectedValueOnce(new Error("stop after options capture"));

    try {
      await POST(postRequest(VALID_BODY));
      const options = jwtVerify.mock.calls[0][2] as { audience: string[] };
      expect(options.audience).not.toContain(
        "TODO-from-google-cloud-console-web-client-id",
      );
    } finally {
      delete process.env.NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID;
    }
  });

  it("fails closed when a signed Google token omits nonce binding", async () => {
    jwtVerify.mockResolvedValueOnce({
      payload: { ...VALID_CLAIMS, nonce: undefined },
    });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe(
      "TOKEN_VERIFICATION_FAILED",
    );
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("consumes a server-issued nonce once and refuses replay", async () => {
    jwtVerify.mockResolvedValue({ payload: VALID_CLAIMS });
    userFindUnique.mockResolvedValue({
      id: "u1", email: "user@example.com", name: "User", image: null,
      role: "USER", needsOnboarding: false, organization: { setupCompletedAt: null },
    });
    encodeJwt.mockResolvedValue("session");
    nonceUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const first = await POST(postRequest(VALID_BODY));
    const replay = await POST(postRequest(VALID_BODY));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect((await replay.json()).error.code).toBe("NONCE_REPLAYED_OR_EXPIRED");
    expect(encodeJwt).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown challenge before remote JWKS verification", async () => {
    nonceFindFirst.mockResolvedValueOnce(null);
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect(jwtVerify).not.toHaveBeenCalled();
    expect(nonceUpdateMany).not.toHaveBeenCalled();
  });

  it("rate-limits before remote JWKS verification", async () => {
    applyRateLimit.mockResolvedValueOnce(
      Response.json({ error: "Too many requests" }, { status: 429 }),
    );
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(429);
    expect(jwtVerify).not.toHaveBeenCalled();
    expect(nonceFindFirst).not.toHaveBeenCalled();
  });

  it("uses the linked provider subject when Apple omits email on later sign-ins", async () => {
    jwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "apple_sub",
        nonce: "native-client-nonce",
      },
    });
    accountFindUnique.mockResolvedValueOnce({
      id: "account-apple",
      user: {
        id: "apple-user",
        email: "relay@example.com",
        name: "Apple User",
        image: null,
        role: "USER",
        needsOnboarding: false,
      },
    });
    userFindUnique.mockResolvedValueOnce({
      organization: { setupCompletedAt: null },
    });
    encodeJwt.mockResolvedValueOnce("session");

    const response = await POST(
      postRequest({ ...VALID_BODY, provider: "apple" }),
    );
    expect(response.status).toBe(200);
    expect(accountFindUnique).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "apple",
          providerAccountId: "apple_sub",
        },
      },
      include: { user: true },
    });
    expect(userCreate).not.toHaveBeenCalled();
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it.each([
    [
      { provider: "apple", idToken: "a".repeat(64) },
      undefined,
      400,
      "VALIDATION",
    ],
    [
      { provider: "apple", idToken: "a".repeat(64), nonce: "native-client-nonce" },
      undefined,
      401,
      "TOKEN_VERIFICATION_FAILED",
    ],
  ])(
    "fails closed when a signed Apple token lacks request/claim nonce binding",
    async (body, tokenNonce, expectedStatus, expectedCode) => {
      jwtVerify.mockResolvedValueOnce({
        payload: {
          ...VALID_CLAIMS,
          sub: "apple_sub",
          nonce: tokenNonce,
        },
      });
      const response = await POST(postRequest(body));
      expect(response.status).toBe(expectedStatus);
      expect((await response.json()).error.code).toBe(expectedCode);
      expect(userFindUnique).not.toHaveBeenCalled();
    },
  );

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

  it("rejects a signed token whose provider email is not verified", async () => {
    jwtVerify.mockResolvedValueOnce({
      payload: { ...VALID_CLAIMS, email_verified: false },
    });
    userFindUnique
      .mockResolvedValueOnce({
        id: "victim",
        email: "user@example.com",
        name: "Victim",
        image: null,
        role: "ADMIN",
        needsOnboarding: false,
      })
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockResolvedValueOnce("mutant-session");
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(encodeJwt).not.toHaveBeenCalled();
  });

  it("refuses owner sign-in while a live team invitation owns the email", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userInviteFindFirst.mockResolvedValueOnce({ id: "invite_1" });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ACTIVE_INVITE");
    expect(userCreate).not.toHaveBeenCalled();
    expect(encodeJwt).not.toHaveBeenCalled();
  });

  it("fails closed instead of minting a native session for an existing 2FA account", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique.mockResolvedValueOnce({
      id: "u-2fa",
      email: "user@example.com",
      name: "Protected User",
      image: null,
      role: "ADMIN",
      needsOnboarding: false,
      twoFactorEnabled: true,
    });
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("NATIVE_2FA_REQUIRED");
    expect(encodeJwt).not.toHaveBeenCalled();
    expect(findSessionCookie(response)).toBeUndefined();
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
    expect(userFindUnique).toHaveBeenNthCalledWith(1, {
      where: { email: "user@example.com" },
    });
    expect(accountCreate).toHaveBeenCalledWith({
      data: {
        userId: EXISTING_USER.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "google_sub",
      },
    });

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
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "user@example.com" }),
      }),
    );

    const cookie = findSessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie!.maxAge).toBe(NINETY_DAYS_S);
    expect(cookie!.httpOnly).toBe(true);
  });
});
