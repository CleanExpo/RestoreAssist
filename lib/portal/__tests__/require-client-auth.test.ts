import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authenticateClientRequest = vi.hoisted(() => vi.fn());
const clientUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/portal/client-jwt", () => ({
  authenticateClientRequest: (...args: unknown[]) =>
    authenticateClientRequest(...args),
}));
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

  // Interim (RA-8461 slice 1): nothing can change a portal password yet, so a
  // token minted before binding cannot be stale. Refusing it would sign out
  // homeowners who have forgotten their password before recovery exists.
  // The change that first writes ClientUser.passwordHash must flip this test
  // to a refusal in the same commit.
  it("still accepts a token issued before credential binding existed (RA-8461 interim)", async () => {
    const legacy = { ...CLAIMS, credentialFingerprint: null };
    authenticateClientRequest.mockResolvedValue(legacy);
    clientUserFindUnique.mockResolvedValue({
      id: "client_user_1",
      clientId: "client_1",
      passwordHash: OLD_HASH,
    });

    expect(await requireClientAuth(request())).toEqual({
      ok: true,
      claims: legacy,
    });
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

  it("fails closed with the same safe response when revalidation is unavailable", async () => {
    clientUserFindUnique.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expectSafeUnauthorized(await requireClientAuth(request()));
    expect(consoleError).toHaveBeenCalledWith(
      "Portal client auth revalidation failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
