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

const CLAIMS = {
  sub: "client_user_1",
  clientId: "client_1",
  email: "homeowner@example.com",
  name: "Home Owner",
  typ: "client-portal" as const,
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
    });

    const result = await requireClientAuth(request());

    expect(result).toEqual({ ok: true, claims: CLAIMS });
    expect(clientUserFindUnique).toHaveBeenCalledWith({
      where: { id: "client_user_1" },
      select: { id: true, clientId: true },
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
