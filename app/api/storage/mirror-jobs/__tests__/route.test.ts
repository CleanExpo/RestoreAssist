/**
 * SP-E Block 7 — /api/storage/mirror-jobs auth + scoping.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sessionMock, userMock, storageMirrorJobMock, getStatsMock } =
  vi.hoisted(() => ({
    sessionMock: { get: vi.fn() },
    userMock: { findUnique: vi.fn() },
    storageMirrorJobMock: { findMany: vi.fn() },
    getStatsMock: vi.fn(),
  }));

vi.mock("next-auth", () => ({
  getServerSession: () => sessionMock.get(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: userMock,
    storageMirrorJob: storageMirrorJobMock,
  },
}));

vi.mock("@/lib/queue/storage-mirror", () => ({
  getMirrorQueueStats: getStatsMock,
}));

import { GET } from "@/app/api/storage/mirror-jobs/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(): NextRequest {
  return new NextRequest("http://localhost/api/storage/mirror-jobs");
}

describe("GET /api/storage/mirror-jobs", () => {
  it("returns 401 when there's no session", async () => {
    sessionMock.get.mockResolvedValueOnce(null);
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user has no organisation", async () => {
    sessionMock.get.mockResolvedValueOnce({ user: { id: "user_1" } });
    userMock.findUnique.mockResolvedValueOnce({ organizationId: null });
    const res = await GET(buildRequest());
    expect(res.status).toBe(404);
  });

  it("returns jobs scoped to the caller's org", async () => {
    sessionMock.get.mockResolvedValueOnce({ user: { id: "user_1" } });
    userMock.findUnique.mockResolvedValueOnce({ organizationId: "org_1" });
    storageMirrorJobMock.findMany.mockResolvedValueOnce([
      { id: "j1", kind: "PHOTO", status: "COMPLETED", filename: "f.jpg" },
    ]);
    getStatsMock.mockResolvedValueOnce({
      total: 1,
      pending: 0,
      processing: 0,
      completed: 1,
      failed: 0,
      lastCompletedAt: null,
      totalBytesMirrored: 0,
    });

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.jobs).toHaveLength(1);
    expect(body.data.stats.total).toBe(1);

    // Verify the where clause scopes by orgId
    const findManyArg = storageMirrorJobMock.findMany.mock.calls[0][0];
    expect(findManyArg.where.orgId).toBe("org_1");
  });
});
