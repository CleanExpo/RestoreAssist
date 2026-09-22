/**
 * RA-7647 — a null organisation must never match another null organisation
 * (lib/auth/assert-tenancy.ts). A Google signup has no organisation until it
 * invites someone, and every signup is role ADMIN, so scoping Admin > Users by
 * `organizationId: adminUser.organizationId` showed every org-less business
 * to every other one, and the id-only write branch let one flag any user on
 * the platform as a junior technician. An org-less ADMIN's scope is
 * themselves. Real admin-auth helpers run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userCount = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit-log", () => ({ recordMutationAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
      count: (...args: unknown[]) => userCount(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

import { GET } from "../route";
import { PATCH } from "../[id]/route";

const ADMIN_ROWS: Record<string, { organizationId: string | null }> = {
  "admin-a": { organizationId: null },
  "admin-org": { organizationId: "org-1" },
};

function signIn(adminId: keyof typeof ADMIN_ROWS) {
  getServerSession.mockResolvedValue({ user: { id: adminId, role: "ADMIN" } });
}

function patch(id: string) {
  return PATCH(
    new NextRequest(`http://localhost/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isJuniorTechnician: true }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // verifyAdminFromDb re-reads the caller; the PATCH guard reads the target.
  userFindUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      if (where.id in ADMIN_ROWS) {
        return { id: where.id, role: "ADMIN", ...ADMIN_ROWS[where.id] };
      }
      if (where.id === "user-b") {
        return { id: "user-b", role: "ADMIN", organizationId: null };
      }
      return null;
    },
  );
  userFindMany.mockResolvedValue([]);
  userCount.mockResolvedValue(0);
  userUpdate.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    email: "x@example.com",
    isJuniorTechnician: true,
  }));
});

describe("GET /api/admin/users (RA-7647)", () => {
  it("shows an org-less ADMIN only themselves, never every org-less user", async () => {
    signIn("admin-a");

    const res = await GET(new NextRequest("http://localhost/api/admin/users"));

    expect(res.status).toBe(200);
    const { where } = userFindMany.mock.calls[0][0];
    expect(where.id).toBe("admin-a");
    expect(where).not.toHaveProperty("organizationId");
    expect(userCount.mock.calls[0][0].where.id).toBe("admin-a");
  });

  it("keeps an organisation ADMIN scoped to their organisation", async () => {
    signIn("admin-org");

    const res = await GET(new NextRequest("http://localhost/api/admin/users"));

    expect(res.status).toBe(200);
    const { where } = userFindMany.mock.calls[0][0];
    expect(where.organizationId).toBe("org-1");
  });
});

describe("PATCH /api/admin/users/[id] (RA-7647)", () => {
  it("refuses an org-less ADMIN editing another org-less user, and writes nothing", async () => {
    signIn("admin-a");

    const res = await patch("user-b");

    expect([403, 404]).toContain(res.status);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("lets an org-less ADMIN change only their own row", async () => {
    signIn("admin-a");

    const res = await patch("admin-a");

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin-a" } }),
    );
  });
});
