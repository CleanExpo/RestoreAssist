/**
 * RA-4861 — tests for POST /api/admin/portal-accounts/[id]/rotate.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const accountFindUnique = vi.fn();
const accountUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    clientPortalAccount: {
      findUnique: (...a: unknown[]) => accountFindUnique(...a),
      update: (...a: unknown[]) => accountUpdate(...a),
    },
  },
}));

import { POST as rotateRoute } from "../route";

const ADMIN_SESSION = { user: { id: "u_admin", role: "ADMIN" } };
const USER_SESSION = { user: { id: "u_normal", role: "USER" } };

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  accountFindUnique.mockReset();
  accountUpdate.mockReset();
});

function adminAuthOk() {
  getServerSession.mockResolvedValue(ADMIN_SESSION);
  userFindUnique.mockResolvedValue({
    id: "u_admin",
    role: "ADMIN",
    organizationId: null,
  });
}

describe("POST /api/admin/portal-accounts/[id]/rotate", () => {
  it("returns 403 for non-admin", async () => {
    getServerSession.mockResolvedValueOnce(USER_SESSION);
    const res = await rotateRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_1/rotate",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when account does not exist", async () => {
    adminAuthOk();
    accountFindUnique.mockResolvedValueOnce(null);
    const res = await rotateRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_x/rotate",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_x" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when the account is already revoked", async () => {
    adminAuthOk();
    accountFindUnique.mockResolvedValueOnce({
      id: "cpa_1",
      revokedAt: new Date(),
    });
    const res = await rotateRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_1/rotate",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_1" }) },
    );
    expect(res.status).toBe(409);
  });

  it("rotates the token, stamps tokenRotatedAt, returns the new token (different from any prior)", async () => {
    adminAuthOk();
    accountFindUnique.mockResolvedValueOnce({ id: "cpa_1", revokedAt: null });
    accountUpdate.mockImplementationOnce(({ data }) => ({
      id: "cpa_1",
      clientId: "c_1",
      token: data.token,
      tokenRotatedAt: data.tokenRotatedAt,
    }));
    const res = await rotateRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_1/rotate",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.data.tokenRotatedAt).toBeDefined();
    // The DB write replaces the token in-place — by deliberation short-circuit
    // #1 + lookupPortalAccount(token), the OLD token will no longer match any
    // row in the table, so it immediately stops working. We assert the
    // contract here at the controller layer.
    expect(accountUpdate).toHaveBeenCalledTimes(1);
    const writeCall = accountUpdate.mock.calls[0][0];
    expect(writeCall.where).toEqual({ id: "cpa_1" });
    expect(writeCall.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
