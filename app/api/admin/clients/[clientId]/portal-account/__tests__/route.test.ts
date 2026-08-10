/**
 * RA-4861 — tests for POST /api/admin/clients/[clientId]/portal-account.
 * The matching tests for rotate / revoke live next to their own routes
 * (vitest's module resolver doesn't like cross-bracketed-directory
 * relative imports).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const clientFindUnique = vi.fn();
const accountCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    client: { findUnique: (...a: unknown[]) => clientFindUnique(...a) },
    clientPortalAccount: {
      create: (...a: unknown[]) => accountCreate(...a),
    },
  },
}));

import { POST as createRoute } from "../route";

const ADMIN_SESSION = { user: { id: "u_admin", role: "ADMIN" } };
const USER_SESSION = { user: { id: "u_normal", role: "USER" } };

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  clientFindUnique.mockReset();
  accountCreate.mockReset();
});

function adminAuthOk() {
  getServerSession.mockResolvedValue(ADMIN_SESSION);
  userFindUnique.mockResolvedValue({
    id: "u_admin",
    role: "ADMIN",
    organizationId: "org_1",
  });
}

describe("POST /api/admin/clients/[clientId]/portal-account", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await createRoute(
      new NextRequest("http://localhost/api/admin/clients/c_1/portal-account", {
        method: "POST",
      }),
      { params: Promise.resolve({ clientId: "c_1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not ADMIN", async () => {
    getServerSession.mockResolvedValueOnce(USER_SESSION);
    const res = await createRoute(
      new NextRequest("http://localhost/api/admin/clients/c_1/portal-account", {
        method: "POST",
      }),
      { params: Promise.resolve({ clientId: "c_1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the client does not exist", async () => {
    adminAuthOk();
    clientFindUnique.mockResolvedValueOnce(null);
    const res = await createRoute(
      new NextRequest(
        "http://localhost/api/admin/clients/c_missing/portal-account",
        { method: "POST" },
      ),
      { params: Promise.resolve({ clientId: "c_missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("fails closed when the current admin has no organisation", async () => {
    adminAuthOk();
    userFindUnique.mockResolvedValueOnce({
      id: "u_admin",
      role: "ADMIN",
      organizationId: null,
    });

    const res = await createRoute(
      new NextRequest("http://localhost/api/admin/clients/c_1/portal-account", {
        method: "POST",
      }),
      { params: Promise.resolve({ clientId: "c_1" }) },
    );

    expect(res.status).toBe(404);
    expect(clientFindUnique).not.toHaveBeenCalled();
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it("returns 404 and does not mint a token for a client outside the admin's organisation", async () => {
    adminAuthOk();
    clientFindUnique.mockResolvedValueOnce(null);

    const res = await createRoute(
      new NextRequest(
        "http://localhost/api/admin/clients/c_foreign/portal-account",
        { method: "POST" },
      ),
      { params: Promise.resolve({ clientId: "c_foreign" }) },
    );

    expect(res.status).toBe(404);
    expect(clientFindUnique).toHaveBeenCalledWith({
      where: {
        id: "c_foreign",
        user: { organizationId: "org_1" },
      },
      select: { id: true },
    });
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it("creates a new account, returns the token once, and uses 256-bit base64url", async () => {
    adminAuthOk();
    clientFindUnique.mockResolvedValueOnce({ id: "c_1" });
    accountCreate.mockImplementationOnce(({ data }) => ({
      id: "cpa_1",
      clientId: data.client.connect.id,
      token: data.token,
      createdAt: new Date("2026-05-15T00:00:00Z"),
    }));

    const res = await createRoute(
      new NextRequest("http://localhost/api/admin/clients/c_1/portal-account", {
        method: "POST",
      }),
      { params: Promise.resolve({ clientId: "c_1" }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("cpa_1");
    expect(body.data.clientId).toBe("c_1");
    // base64url alphabet only, length 43 for 32 random bytes (256 bits → ceil(256/6) = 43).
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(accountCreate.mock.calls[0][0].data.client.connect).toEqual({
      id: "c_1",
      user: { organizationId: "org_1" },
    });
  });
});
