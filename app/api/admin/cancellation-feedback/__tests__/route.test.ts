/**
 * RA-8596 — GET /api/admin/cancellation-feedback access and shape.
 *
 *   401 — no session
 *   403 — non-admin session (no DB read of feedback)
 *   403 — ADMIN who is not on the platform staff allowlist
 *   200 — staff: newest-first page, capped limit, nextCursor, 90-day counts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const feedbackFindMany = vi.fn();
const feedbackGroupBy = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    cancellationFeedback: {
      findMany: (...args: unknown[]) => feedbackFindMany(...args),
      groupBy: (...args: unknown[]) => feedbackGroupBy(...args),
    },
  },
}));

import { GET } from "../route";

function makeRequest(qs = "") {
  return new NextRequest(
    `http://localhost/api/admin/cancellation-feedback${qs}`,
  );
}

function mockAdmin(id = "admin-1") {
  getServerSession.mockResolvedValue({ user: { id, role: "ADMIN" } });
  userFindUnique.mockResolvedValue({ id, role: "ADMIN", organizationId: null });
}

function row(id: string, daysAgo: number) {
  return {
    id,
    createdAt: new Date(Date.now() - daysAgo * 86_400_000),
    reason: "missing_feature",
    comment: "<b>needs xero</b>",
    subscriptionPlan: "Monthly Plan",
    tenureDays: 40,
  };
}

beforeEach(() => {
  process.env.PLATFORM_SUPPORT_USER_IDS = "admin-1";
  getServerSession.mockReset();
  userFindUnique.mockReset();
  feedbackFindMany.mockReset();
  feedbackGroupBy.mockReset();
  feedbackGroupBy.mockResolvedValue([]);
});

describe("GET /api/admin/cancellation-feedback", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(feedbackFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin session and reads no feedback", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "USER" } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(feedbackFindMany).not.toHaveBeenCalled();
    expect(feedbackGroupBy).not.toHaveBeenCalled();
  });

  it("returns 403 for an ADMIN (firm owner) who is not platform staff", async () => {
    mockAdmin("firm-owner-9");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(feedbackFindMany).not.toHaveBeenCalled();
  });

  it("returns a newest-first page with a cursor and 90-day reason counts", async () => {
    mockAdmin();
    feedbackFindMany.mockResolvedValue([row("f3", 1), row("f2", 2), row("f1", 3)]);
    feedbackGroupBy.mockResolvedValue([
      { reason: "missing_feature", _count: { _all: 3 } },
      { reason: "too_expensive", _count: { _all: 1 } },
    ]);

    const res = await GET(makeRequest("?limit=2"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["f3", "f2"]);
    expect(body.nextCursor).toBe("f2");
    expect(body.items[0].comment).toBe("<b>needs xero</b>");
    expect(body.reasonCounts90d).toEqual({
      missing_feature: 3,
      too_expensive: 1,
    });

    const findArgs = feedbackFindMany.mock.calls[0][0];
    expect(findArgs.take).toBe(3);
    expect(findArgs.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(findArgs.select).not.toHaveProperty("userId");

    const groupArgs = feedbackGroupBy.mock.calls[0][0];
    const since: Date = groupArgs.where.createdAt.gte;
    const days = (Date.now() - since.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it("caps the page size at 50 and passes the cursor through", async () => {
    mockAdmin();
    feedbackFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("?limit=9999&cursor=f9"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextCursor).toBeNull();
    const findArgs = feedbackFindMany.mock.calls[0][0];
    expect(findArgs.take).toBe(51);
    expect(findArgs.cursor).toEqual({ id: "f9" });
    expect(findArgs.skip).toBe(1);
  });
});
