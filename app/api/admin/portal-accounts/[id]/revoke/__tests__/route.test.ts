/**
 * RA-4861 — tests for POST /api/admin/portal-accounts/[id]/revoke.
 * Idempotent: re-revoking a revoked row is a no-op (returns 200 with
 * `alreadyRevoked: true` and does NOT call update again).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const accountFindUnique = vi.fn();
const accountUpdate = vi.fn();
const inspectionFindFirst = vi.fn();
const auditLogCreate = vi.fn();

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
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
  },
}));

import { POST as revokeRoute } from "../route";

const ADMIN_SESSION = { user: { id: "u_admin", role: "ADMIN" } };
const USER_SESSION = { user: { id: "u_normal", role: "USER" } };

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  accountFindUnique.mockReset();
  accountUpdate.mockReset();
  inspectionFindFirst.mockReset();
  auditLogCreate.mockReset();
  auditLogCreate.mockResolvedValue({});
  inspectionFindFirst.mockResolvedValue(null);
});

function adminAuthOk() {
  getServerSession.mockResolvedValue(ADMIN_SESSION);
  userFindUnique.mockResolvedValue({
    id: "u_admin",
    role: "ADMIN",
    organizationId: null,
  });
}

describe("POST /api/admin/portal-accounts/[id]/revoke", () => {
  it("returns 403 for non-admin", async () => {
    getServerSession.mockResolvedValueOnce(USER_SESSION);
    const res = await revokeRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_1/revoke",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when account does not exist", async () => {
    adminAuthOk();
    accountFindUnique.mockResolvedValueOnce(null);
    const res = await revokeRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_x/revoke",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_x" }) },
    );
    expect(res.status).toBe(404);
  });

  it("is idempotent on already-revoked accounts (returns alreadyRevoked: true, no second write)", async () => {
    adminAuthOk();
    const revokedAt = new Date("2026-05-14T00:00:00Z");
    accountFindUnique.mockResolvedValueOnce({
      id: "cpa_1",
      clientId: "c_1",
      revokedAt,
    });
    const res = await revokeRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_1/revoke",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.alreadyRevoked).toBe(true);
    expect(accountUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("revokes a live account, stamps revokedAt, and writes an AuditLog row when an inspection exists", async () => {
    adminAuthOk();
    accountFindUnique.mockResolvedValueOnce({
      id: "cpa_1",
      clientId: "c_1",
      revokedAt: null,
    });
    accountUpdate.mockImplementationOnce(({ data }) => ({
      id: "cpa_1",
      clientId: "c_1",
      revokedAt: data.revokedAt,
    }));
    inspectionFindFirst.mockResolvedValueOnce({ id: "ins_1" });

    const res = await revokeRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_1/revoke",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.revokedAt).toBeDefined();
    expect(body.data.alreadyRevoked).toBeUndefined();

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditArg = auditLogCreate.mock.calls[0][0];
    expect(auditArg.data.action).toBe("CLIENT_PORTAL_ACCOUNT_REVOKED");
    expect(auditArg.data.entityType).toBe("ClientPortalAccount");
    expect(auditArg.data.entityId).toBe("cpa_1");
    expect(auditArg.data.inspectionId).toBe("ins_1");
    expect(auditArg.data.userId).toBe("u_admin");
  });

  it("still revokes when the client has no inspection (AuditLog skipped, no FK violation)", async () => {
    adminAuthOk();
    accountFindUnique.mockResolvedValueOnce({
      id: "cpa_orphan",
      clientId: "c_2",
      revokedAt: null,
    });
    accountUpdate.mockImplementationOnce(({ data }) => ({
      id: "cpa_orphan",
      clientId: "c_2",
      revokedAt: data.revokedAt,
    }));
    inspectionFindFirst.mockResolvedValueOnce(null);

    const res = await revokeRoute(
      new NextRequest(
        "http://localhost/api/admin/portal-accounts/cpa_orphan/revoke",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "cpa_orphan" }) },
    );
    expect(res.status).toBe(200);
    expect(accountUpdate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
