import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const cronJobRunFindMany = vi.fn();
const cronJobRunCount = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    cronJobRun: {
      findMany: (...args: unknown[]) => cronJobRunFindMany(...args),
      count: (...args: unknown[]) => cronJobRunCount(...args),
    },
  },
}));

import { GET } from "../route";

function makeRequest(url = "http://localhost/api/admin/cron-runs") {
  return new NextRequest(url);
}

function mockAdmin() {
  getServerSession.mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({
    id: "admin-1",
    role: "ADMIN",
    organizationId: null,
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  cronJobRunFindMany.mockReset();
  cronJobRunCount.mockReset();
});

describe("GET /api/admin/cron-runs", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(cronJobRunFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin session", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(cronJobRunFindMany).not.toHaveBeenCalled();
  });

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
    expect(cronJobRunFindMany).not.toHaveBeenCalled();
  });

  it("returns a bounded, most-recent-first list with a failed-count summary for a verified admin", async () => {
    mockAdmin();
    cronJobRunFindMany.mockResolvedValue([
      {
        id: "run-2",
        jobName: "process-emails",
        status: "failed",
        startedAt: new Date("2026-07-04T02:00:00Z"),
        completedAt: new Date("2026-07-04T02:00:05Z"),
        durationMs: 5000,
        errorMessage: 'Cron job "process-emails" failed',
        itemsProcessed: 0,
      },
      {
        id: "run-1",
        jobName: "cleanup",
        status: "completed",
        startedAt: new Date("2026-07-04T01:00:00Z"),
        completedAt: new Date("2026-07-04T01:00:02Z"),
        durationMs: 2000,
        errorMessage: null,
        itemsProcessed: 12,
      },
    ]);
    cronJobRunCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.failedCount).toBe(1);
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0].id).toBe("run-2");
    expect(body.runs[0].status).toBe("failed");

    // Explicit select + bounded take (CLAUDE.md rule 3), most-recent first.
    const findManyArgs = cronJobRunFindMany.mock.calls[0][0];
    expect(findManyArgs.take).toBe(50);
    expect(findManyArgs.select).toBeDefined();
    expect(findManyArgs.orderBy).toEqual({ startedAt: "desc" });

    // Second count call is the unfiltered failed-count summary.
    expect(cronJobRunCount.mock.calls[1][0]).toEqual({
      where: { status: "failed" },
    });
  });

  it("filters to failed runs only when ?status=failed is passed", async () => {
    mockAdmin();
    cronJobRunFindMany.mockResolvedValue([]);
    cronJobRunCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const res = await GET(
      makeRequest("http://localhost/api/admin/cron-runs?status=failed"),
    );

    expect(res.status).toBe(200);
    const findManyArgs = cronJobRunFindMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({ status: "failed" });
    expect(cronJobRunCount.mock.calls[0][0]).toEqual({
      where: { status: "failed" },
    });
  });

  it("ignores an invalid status filter value", async () => {
    mockAdmin();
    cronJobRunFindMany.mockResolvedValue([]);
    cronJobRunCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const res = await GET(
      makeRequest("http://localhost/api/admin/cron-runs?status=bogus"),
    );

    expect(res.status).toBe(200);
    const findManyArgs = cronJobRunFindMany.mock.calls[0][0];
    expect(findManyArgs.where).toEqual({});
  });

  it("caps take at 100 even when a larger limit is requested", async () => {
    mockAdmin();
    cronJobRunFindMany.mockResolvedValue([]);
    cronJobRunCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const res = await GET(
      makeRequest("http://localhost/api/admin/cron-runs?limit=9999"),
    );

    expect(res.status).toBe(200);
    expect(cronJobRunFindMany.mock.calls[0][0].take).toBe(100);
  });
});
