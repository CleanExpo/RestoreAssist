import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userGroupBy = vi.fn();
const userCount = vi.fn();
const stripeWebhookCount = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      groupBy: (...args: unknown[]) => userGroupBy(...args),
      count: (...args: unknown[]) => userCount(...args),
    },
    stripeWebhookEvent: {
      count: (...args: unknown[]) => stripeWebhookCount(...args),
    },
  },
}));

import { GET } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/business-metrics");
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userGroupBy.mockReset();
  userCount.mockReset();
  stripeWebhookCount.mockReset();
});

describe("GET /api/admin/business-metrics", () => {
  it("rejects stale ADMIN JWTs when the database role has been demoted", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "USER",
      organizationId: null,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { id: true, role: true, organizationId: true },
    });
    expect(userGroupBy).not.toHaveBeenCalled();
  });

  it("returns metrics only after DB admin revalidation succeeds", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      organizationId: null,
    });
    userGroupBy.mockResolvedValue([
      { subscriptionPlan: "Monthly Plan", _count: { id: 2 } },
    ]);
    userCount.mockResolvedValue(1);
    stripeWebhookCount.mockResolvedValue(0);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.mrr).toBe(158);
    expect(body.payingCustomers).toBe(2);
  });
});
