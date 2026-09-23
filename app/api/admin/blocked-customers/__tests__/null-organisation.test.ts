/**
 * RA-7647 — `organizationId: null` in a Prisma filter matches every org-less
 * user on the platform, so an org-less ADMIN (a Google signup before its
 * first invite) saw other businesses' names, emails and payment status here.
 * A null organisation never matches another null organisation: the scope is
 * the ADMIN themselves. Real admin-auth helpers run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userCount = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
      count: (...args: unknown[]) => userCount(...args),
    },
  },
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin-a", role: "ADMIN" } });
  userFindUnique.mockResolvedValue({
    id: "admin-a",
    role: "ADMIN",
    organizationId: null,
  });
  userFindMany.mockResolvedValue([]);
  userCount.mockResolvedValue(0);
});

describe("GET /api/admin/blocked-customers for an org-less ADMIN (RA-7647)", () => {
  it("is scoped to the ADMIN alone, never to organizationId null", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/admin/blocked-customers"),
    );

    expect(res.status).toBe(200);
    const { where } = userFindMany.mock.calls[0][0];
    expect(where.id).toBe("admin-a");
    expect(where).not.toHaveProperty("organizationId");
    expect(userCount.mock.calls[0][0].where.id).toBe("admin-a");
  });
});
