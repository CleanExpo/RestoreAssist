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
