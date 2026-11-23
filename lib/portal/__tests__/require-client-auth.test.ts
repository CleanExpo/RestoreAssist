import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authenticateClientRequest = vi.hoisted(() => vi.fn());
const clientUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/portal/client-jwt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal/client-jwt")>();
  return {
    ...actual,
    authenticateClientRequest: (...args: unknown[]) =>
      authenticateClientRequest(...args),
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientUser: {
      findUnique: (...args: unknown[]) => clientUserFindUnique(...args),
    },
  },
}));

import { requireClientAuth } from "@/lib/portal/require-client-auth";
import { credentialFingerprint } from "@/lib/portal/credential-fingerprint";

process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";

const OLD_HASH = "$2a$10$hash-for-the-old-password";
const NEW_HASH = "$2a$10$hash-for-the-new-password";

const CLAIMS = {
  sub: "client_user_1",
  clientId: "client_1",
  email: "homeowner@example.com",
  name: "Home Owner",
  typ: "client-portal" as const,
  credentialFingerprint: credentialFingerprint(OLD_HASH),
};

function request() {
  return new NextRequest("http://localhost/api/portal/reports", {
    headers: { authorization: "Bearer signed-token" },
  });
}

beforeEach(() => {
  authenticateClientRequest.mockReset();
  clientUserFindUnique.mockReset();
  authenticateClientRequest.mockResolvedValue(CLAIMS);
});

async function expectSafeUnauthorized(
  result: Awaited<ReturnType<typeof requireClientAuth>>,
) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected authentication failure");
  expect(result.response.status).toBe(401);
  expect(await result.response.json()).toEqual({
    error: "Unauthorized — please sign in again",
  });
}

describe("requireClientAuth", () => {
  it("accepts an active ClientUser still bound to the JWT client", async () => {
    clientUserFindUnique.mockResolvedValue({
      id: "client_user_1",
      clientId: "client_1",
      passwordHash: OLD_HASH,
    });

    const result = await requireClientAuth(request());

    expect(result).toEqual({ ok: true, claims: CLAIMS });
    expect(clientUserFindUnique).toHaveBeenCalledWith({
      where: { id: "client_user_1" },
      select: { id: true, clientId: true, passwordHash: true },
    });
  });

  it("rejects a token signed before the password was changed (RA-8461)", async () => {
    clientUserFindUnique.mockResolvedValue({
      id: "client_user_1",
      clientId: "client_1",
      passwordHash: NEW_HASH,
    });

    await expectSafeUnauthorized(await requireClientAuth(request()));
  });

  it("accepts a token signed after the password was changed (RA-8461)", async () => {
    const fresh = { ...CLAIMS, credentialFingerprint: credentialFingerprint(NEW_HASH) };
    authenticateClientRequest.mockResolvedValue(fresh);
    clientUserFindUnique.mockResolvedValue({
      id: "client_user_1",
      clientId: "client_1",
      passwordHash: NEW_HASH,
    });

    expect(await requireClientAuth(request())).toEqual({ ok: true, claims: fresh });
  });

  // RA-8613: recovery now writes ClientUser.passwordHash, so a token minted
  // before credential binding (no fingerprint) could outlive a password reset.
  it("refuses a token issued before credential binding existed (RA-8613)", async () => {
    const legacy = { ...CLAIMS, credentialFingerprint: null };
    authenticateClientRequest.mockResolvedValue(legacy);
    clientUserFindUnique.mockResolvedValue({
      id: "client_user_1",
      clientId: "client_1",
      passwordHash: OLD_HASH,
    });

    await expectSafeUnauthorized(await requireClientAuth(request()));
  });

  it("rejects a valid JWT after its ClientUser is deleted", async () => {
    clientUserFindUnique.mockResolvedValue(null);

    await expectSafeUnauthorized(await requireClientAuth(request()));
  });

  it("rejects a valid JWT after its ClientUser is bound to another client", async () => {
    clientUserFindUnique.mockResolvedValue({
      id: "client_user_1",
      clientId: "client_2",
      passwordHash: OLD_HASH,
    });

    await expectSafeUnauthorized(await requireClientAuth(request()));
  });

  it("rejects an invalid JWT before querying the database", async () => {
    authenticateClientRequest.mockResolvedValue(null);

    await expectSafeUnauthorized(await requireClientAuth(request()));
    expect(clientUserFindUnique).not.toHaveBeenCalled();
  });

  it("returns 503 when revalidation is unavailable (RA-7509)", async () => {
    clientUserFindUnique.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await requireClientAuth(request());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(503);
    expect(await result.response.json()).toEqual({
      error: "Portal sign-in could not be verified — try again shortly",
      code: "UPSTREAM_FAILED",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Portal client auth revalidation failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("returns 503 when portal JWT secret is not configured (RA-7509)", async () => {
    const { ClientPortalJwtConfigError } = await import(
      "@/lib/portal/client-jwt"
    );
    authenticateClientRequest.mockRejectedValue(
      new ClientPortalJwtConfigError(),
    );

    const result = await requireClientAuth(request());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(503);
    expect(await result.response.json()).toMatchObject({
      code: "PORTAL_JWT_SECRET_MISSING",
    });
  });
});
