import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: the admin user-flag mutation must re-assert the same-org boundary in
// the write `where`, not just in a prior in-code check.

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...a: unknown[]) => verifyAdminFromDb(...a),
}));
vi.mock("@/lib/audit-log", () => ({ recordMutationAudit: vi.fn() }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));

import { PATCH } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin1" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin1", role: "ADMIN", organizationId: "org1" },
  });
});

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("PATCH /api/admin/users/[id] — org-scoped write", () => {
  it("scopes the update to the admin's organization", async () => {
    userFindUnique.mockResolvedValue({ id: "u_target", organizationId: "org1" });
    userUpdate.mockResolvedValue({
      id: "u_target",
      email: "t@x.com",
      isJuniorTechnician: true,
    });

    const res = await patch("u_target", { isJuniorTechnician: true });

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u_target", organizationId: "org1" },
      }),
    );
  });

  it("403s a user outside the admin's organization (existing guard)", async () => {
    userFindUnique.mockResolvedValue({ id: "u_target", organizationId: "org2" });
    const res = await patch("u_target", { isJuniorTechnician: true });
    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
