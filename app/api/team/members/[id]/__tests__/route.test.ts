import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: team member role-change (PATCH) and removal (DELETE) must re-assert
// the caller's organization in the write `where`, not only in a prior check.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
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

import { PATCH, DELETE } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin1" } });
  // currentUser (admin1) is ADMIN in org1; member1 is a USER in org1.
  userFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    where.id === "admin1"
      ? Promise.resolve({ role: "ADMIN", organizationId: "org1" })
      : Promise.resolve({
          id: "member1",
          email: "m@x.com",
          name: "M",
          role: "USER",
          organizationId: "org1",
        }),
  );
  userUpdate.mockResolvedValue({
    id: "member1",
    email: "m@x.com",
    name: "M",
    role: "MANAGER",
    organizationId: "org1",
    createdAt: new Date(),
  });
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("team/members/[id] — org-scoped writes", () => {
  it("PATCH scopes the role update to the caller's organization", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/team/members/member1", {
        method: "PATCH",
        body: JSON.stringify({ role: "MANAGER" }),
      }),
      params("member1"),
    );
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member1", organizationId: "org1" },
      }),
    );
  });

  it("DELETE scopes the soft-remove to the caller's organization", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/team/members/member1", {
        method: "DELETE",
      }),
      params("member1"),
    );
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member1", organizationId: "org1" },
        data: { organizationId: null, managedById: null },
      }),
    );
  });
});
