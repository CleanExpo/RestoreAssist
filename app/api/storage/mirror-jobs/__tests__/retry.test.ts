/**
 * RA-8451 — POST /api/storage/mirror-jobs/retry/[jobId] must not answer
 * 200 when nothing was retried.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sessionMock, userMock, storageMirrorJobMock, retryJobMock } =
  vi.hoisted(() => ({
    sessionMock: { get: vi.fn() },
    userMock: { findUnique: vi.fn() },
    storageMirrorJobMock: { findUnique: vi.fn() },
    retryJobMock: vi.fn(),
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
  retryJob: retryJobMock,
}));

import { POST } from "@/app/api/storage/mirror-jobs/retry/[jobId]/route";

function call(jobId: string) {
  return POST(
    new NextRequest(`http://localhost/api/storage/mirror-jobs/retry/${jobId}`, {
      method: "POST",
    }),
    { params: Promise.resolve({ jobId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.get.mockResolvedValue({ user: { id: "user_1" } });
  userMock.findUnique.mockResolvedValue({ organizationId: "org_1" });
});

describe("POST /api/storage/mirror-jobs/retry/[jobId]", () => {
  it("returns 200 retried:true when the job was reset", async () => {
    storageMirrorJobMock.findUnique.mockResolvedValueOnce({
      orgId: "org_1",
      status: "DEAD_LETTER",
    });
    retryJobMock.mockResolvedValueOnce(true);
    const res = await call("job_1");
    expect(res.status).toBe(200);
    expect((await res.json()).data.retried).toBe(true);
  });

  it("returns 409 with a reason when nothing was retried", async () => {
    storageMirrorJobMock.findUnique.mockResolvedValueOnce({
      orgId: "org_1",
      status: "COMPLETED",
    });
    retryJobMock.mockResolvedValueOnce(false);
    const res = await call("job_1");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 404 for a job in another organisation", async () => {
    storageMirrorJobMock.findUnique.mockResolvedValueOnce({
      orgId: "org_2",
      status: "FAILED",
    });
    const res = await call("job_1");
    expect(res.status).toBe(404);
    expect(retryJobMock).not.toHaveBeenCalled();
  });
});
