import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const jwtVerify = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const idempotencyRecordCreate = vi.fn();
const idempotencyRecordDeleteMany = vi.fn();
const encodeJwt = vi.fn();
const logSecurityEvent = vi.fn();
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
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
    idempotencyRecord: {
      create: (...args: unknown[]) => idempotencyRecordCreate(...args),
      deleteMany: (...args: unknown[]) => idempotencyRecordDeleteMany(...args),
    },
  },
}));
vi.mock("@/lib/security-audit", () => ({
  extractRequestContext: vi.fn(() => ({ ip: "127.0.0.1" })),
  logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  jwtVerify.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  idempotencyRecordCreate.mockReset();
  idempotencyRecordDeleteMany.mockReset();
  encodeJwt.mockReset();
  logSecurityEvent.mockReset();
  applyRateLimit.mockReset();
  logSecurityEvent.mockResolvedValue(undefined);
  applyRateLimit.mockResolvedValue(null);
  idempotencyRecordCreate.mockResolvedValue({ id: "replay_record_1" });
  idempotencyRecordDeleteMany.mockResolvedValue({ count: 1 });
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
  exp: Math.floor(Date.now() / 1000) + 60 * 60,
  email: "USER@EXAMPLE.COM",
  email_verified: true,
  name: "Test User",
  picture: null,
};

describe("POST /api/auth/native-token-exchange", () => {
  it("stops before token verification when rate limited", async () => {
    const request = postRequest(VALID_BODY);
    applyRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(applyRateLimit).toHaveBeenCalledWith(request, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      prefix: "native-token-exchange",
      failClosedOnUpstashError: true,
    });
    expect(jwtVerify).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(encodeJwt).not.toHaveBeenCalled();
  });

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

  it.each([
    ["missing", undefined],
    ["non-numeric", "tomorrow"],
    ["expired", Math.floor(Date.now() / 1000) - 1],
  ])("rejects a %s exp claim before replay consumption", async (_label, exp) => {
    jwtVerify.mockResolvedValueOnce({
      payload: { ...VALID_CLAIMS, exp },
    });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(idempotencyRecordCreate).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(encodeJwt).not.toHaveBeenCalled();
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

describe("POST /api/auth/native-token-exchange — token replay", () => {
  const EXISTING_USER = {
    id: "user_1",
    email: "user@example.com",
    name: "Test User",
    image: null,
    role: "ADMIN",
    needsOnboarding: false,
  };

  function primeSuccessfulExchange(
    claims: Record<string, unknown> = VALID_CLAIMS,
  ) {
    jwtVerify.mockResolvedValue({ payload: claims });
    userFindUnique
      .mockResolvedValueOnce(EXISTING_USER)
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockResolvedValue("encoded.session.jwt");
  }

  it("consumes an id-token digest once without persisting the raw token", async () => {
    const farFutureExp = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
    primeSuccessfulExchange({ ...VALID_CLAIMS, exp: farFutureExp });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(idempotencyRecordCreate).toHaveBeenCalledTimes(1);
    const data = idempotencyRecordCreate.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.scope).toBe("native-oauth-id-token");
    expect(data.key).toMatch(/^[a-f0-9]{64}$/);
    expect(data.fingerprint).toBe(data.key);
    expect(data.cacheKey).toBe(`native-oauth-id-token:${data.key}`);
    expect(data.status).toBe("COMPLETE");
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect((data.expiresAt as Date).getTime()).toBeGreaterThan(
      farFutureExp * 1000,
    );
    expect(JSON.stringify(data)).not.toContain(VALID_BODY.idToken);
  });

  it("rejects a replay before user lookup or session minting", async () => {
    jwtVerify.mockResolvedValue({ payload: VALID_CLAIMS });
    idempotencyRecordCreate.mockRejectedValueOnce({ code: "P2002" });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_VERIFICATION_FAILED",
        message: "Token verification failed",
      },
    });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(encodeJwt).not.toHaveBeenCalled();
    expect(findSessionCookie(response)).toBeUndefined();
  });

  it("allows exactly one of two concurrent exchanges for the same token", async () => {
    const consumed = new Set<string>();
    idempotencyRecordCreate.mockImplementation(
      async ({ data }: { data: { cacheKey: string } }) => {
        if (consumed.has(data.cacheKey)) throw { code: "P2002" };
        consumed.add(data.cacheKey);
        return { id: "replay_record_1" };
      },
    );
    primeSuccessfulExchange();

    const responses = await Promise.all([
      POST(postRequest(VALID_BODY)),
      POST(postRequest(VALID_BODY)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    expect(userFindUnique).toHaveBeenCalledTimes(2);
    expect(encodeJwt).toHaveBeenCalledTimes(1);
    expect(
      responses.filter((response) => findSessionCookie(response)).length,
    ).toBe(1);
  });

  it("fails closed when the replay ledger write fails unexpectedly", async () => {
    jwtVerify.mockResolvedValue({ payload: VALID_CLAIMS });
    idempotencyRecordCreate.mockRejectedValueOnce(new Error("database offline"));

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(500);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(encodeJwt).not.toHaveBeenCalled();
    expect(findSessionCookie(response)).toBeUndefined();
  });

  it("releases the consumed digest when downstream session minting fails", async () => {
    jwtVerify.mockResolvedValueOnce({ payload: VALID_CLAIMS });
    userFindUnique
      .mockResolvedValueOnce(EXISTING_USER)
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockRejectedValueOnce(new Error("NEXTAUTH_SECRET invalid"));

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(500);
    const cacheKey = idempotencyRecordCreate.mock.calls[0][0].data.cacheKey;
    expect(idempotencyRecordDeleteMany).toHaveBeenCalledWith({
      where: { cacheKey },
    });
    expect(findSessionCookie(response)).toBeUndefined();
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

describe("POST /api/auth/native-token-exchange — verified email", () => {
  const EXISTING_USER = {
    id: "user_1",
    email: "user@example.com",
    name: "Test User",
    image: null,
    role: "ADMIN",
    needsOnboarding: false,
  };

  it.each([
    ["missing", undefined],
    ["false", false],
  ])(
    "rejects a %s email_verified claim before any downstream work",
    async (_label, emailVerified) => {
      const claims = { ...VALID_CLAIMS } as Record<string, unknown>;
      if (emailVerified === undefined) {
        delete claims.email_verified;
      } else {
        claims.email_verified = emailVerified;
      }
      jwtVerify.mockResolvedValueOnce({ payload: claims });

      const response = await POST(postRequest(VALID_BODY));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        error: {
          code: "TOKEN_VERIFICATION_FAILED",
          message: "Token verification failed",
        },
      });
      expect(userFindUnique).not.toHaveBeenCalled();
      expect(userCreate).not.toHaveBeenCalled();
      expect(encodeJwt).not.toHaveBeenCalled();
      expect(findSessionCookie(response)).toBeUndefined();
    },
  );

  it.each([
    ["boolean true", true],
    ["string true", "true"],
  ])("accepts email_verified as %s", async (_label, emailVerified) => {
    jwtVerify.mockResolvedValueOnce({
      payload: { ...VALID_CLAIMS, email_verified: emailVerified },
    });
    userFindUnique
      .mockResolvedValueOnce(EXISTING_USER)
      .mockResolvedValueOnce({ organization: { setupCompletedAt: null } });
    encodeJwt.mockResolvedValueOnce("encoded.session.jwt");

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(userFindUnique).toHaveBeenCalled();
    expect(encodeJwt).toHaveBeenCalledTimes(1);
    expect(findSessionCookie(response)?.value).toBe("encoded.session.jwt");
  });
});

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
