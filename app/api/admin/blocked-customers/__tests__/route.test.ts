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

function makeRequest(url = "http://localhost/api/admin/blocked-customers") {
  return new NextRequest(url);
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userFindMany.mockReset();
  userCount.mockReset();
});

describe("GET /api/admin/blocked-customers", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin session", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("rejects stale ADMIN JWTs when the database role has been demoted", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "USER",
      organizationId: "org-1",
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("returns a bounded, org-scoped list for a verified admin", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      organizationId: "org-1",
    });
    userFindMany.mockResolvedValue([
      {
        id: "c-1",
        name: "Acme",
        email: "ops@acme.test",
        subscriptionStatus: "PAST_DUE",
        subscriptionPlan: "Monthly Plan",
        lastBillingDate: new Date("2026-05-01T00:00:00Z"),
        nextBillingDate: null,
        subscriptionEndsAt: new Date("2026-06-01T00:00:00Z"),
        trialEndsAt: null,
      },
    ]);
    userCount.mockResolvedValue(1);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].email).toBe("ops@acme.test");
    expect(typeof body.customers[0].daysOverdue).toBe("number");

    // Tenant scoping + blocked-status filter + explicit take bound.
    const findManyArgs = userFindMany.mock.calls[0][0];
    expect(findManyArgs.where.organizationId).toBe("org-1");
    expect(findManyArgs.where.subscriptionStatus.in).toEqual([
      "PAST_DUE",
      "EXPIRED",
      "CANCELED",
    ]);
    expect(findManyArgs.take).toBe(50);
    expect(findManyArgs.select).toBeDefined();
  });

  it("caps take at 100 even when a larger limit is requested", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      organizationId: "org-1",
    });
    userFindMany.mockResolvedValue([]);
    userCount.mockResolvedValue(0);

    const res = await GET(
      makeRequest("http://localhost/api/admin/blocked-customers?limit=9999"),
    );

    expect(res.status).toBe(200);
    expect(userFindMany.mock.calls[0][0].take).toBe(100);
  });
});
