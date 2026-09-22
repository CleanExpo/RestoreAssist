/**
 * RA-7647 — the usage report filtered on `user.organizationId` and, for an
 * org-less ADMIN, on `IS NULL` in its raw daily query. Both match every
 * org-less user on the platform. A null organisation never matches another
 * null organisation: an org-less ADMIN sees only their own usage.
 * Real admin-auth helpers run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const aggregate = vi.fn();
const count = vi.fn();
const groupBy = vi.fn();
const queryRaw = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
    },
    usageEvent: {
      aggregate: (...args: unknown[]) => aggregate(...args),
      count: (...args: unknown[]) => count(...args),
      groupBy: (...args: unknown[]) => groupBy(...args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { GET } from "../route";

function signIn(organizationId: string | null) {
  getServerSession.mockResolvedValue({ user: { id: "admin-a", role: "ADMIN" } });
  userFindUnique.mockResolvedValue({
    id: "admin-a",
    role: "ADMIN",
    organizationId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindMany.mockResolvedValue([]);
  aggregate.mockResolvedValue({ _sum: { totalCost: 0 } });
  count.mockResolvedValue(0);
  groupBy.mockResolvedValue([]);
  queryRaw.mockResolvedValue([]);
});

function request() {
  return new NextRequest("http://localhost/api/admin/usage?month=2026-09");
}

describe("GET /api/admin/usage (RA-7647)", () => {
  it("scopes an org-less ADMIN to their own usage, never to organizationId null", async () => {
    signIn(null);

    const res = await GET(request());

    expect(res.status).toBe(200);
    const { where } = aggregate.mock.calls[0][0];
    expect(where.user).toEqual({ id: "admin-a" });
    const rawCall = JSON.stringify(queryRaw.mock.calls[0]);
    expect(rawCall).not.toContain("IS NULL");
    expect(rawCall).toContain('"admin-a"');
  });

  it("keeps an organisation ADMIN scoped to their organisation", async () => {
    signIn("org-1");

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(aggregate.mock.calls[0][0].where.user).toEqual({
      organizationId: "org-1",
    });
    expect(JSON.stringify(queryRaw.mock.calls[0])).toContain('"org-1"');
  });
});
