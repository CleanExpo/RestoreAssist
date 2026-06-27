import { describe, it, expect, vi, beforeEach } from "vitest";
import { RestoreMode } from "@prisma/client";

const { queueRestoreJobMock, storageMirrorJobMock } = vi.hoisted(() => ({
  queueRestoreJobMock: vi.fn(),
  storageMirrorJobMock: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { storageMirrorJob: storageMirrorJobMock },
}));
vi.mock("@/lib/queue/storage-restore", () => ({
  queueRestoreJob: (...a: unknown[]) => queueRestoreJobMock(...a),
}));

import { computeRestorePlan, enqueueRestorePlan } from "@/lib/restore/plan";

beforeEach(() => {
  storageMirrorJobMock.findMany.mockReset();
  storageMirrorJobMock.count.mockReset();
  queueRestoreJobMock.mockReset();
});

it("computeRestorePlan counts COMPLETED mirror jobs with a driveFileId for the org", async () => {
  storageMirrorJobMock.count.mockResolvedValue(3);
  const out = await computeRestorePlan("org1", { type: "org" });
  expect(out).toEqual({ fileCount: 3 });
  expect(storageMirrorJobMock.count).toHaveBeenCalledWith({
    where: { orgId: "org1", status: "COMPLETED", driveFileId: { not: null } },
  });
});

it("computeRestorePlan filters by inspection when scoped", async () => {
  storageMirrorJobMock.count.mockResolvedValue(1);
  await computeRestorePlan("org1", { type: "inspection", inspectionId: "insp9" });
  expect(storageMirrorJobMock.count).toHaveBeenCalledWith({
    where: {
      orgId: "org1",
      status: "COMPLETED",
      driveFileId: { not: null },
      inspectionId: "insp9",
    },
  });
});

it("enqueueRestorePlan enqueues one restore job per mirror row", async () => {
  storageMirrorJobMock.findMany.mockResolvedValue([
    {
      id: "mj1",
      kind: "PHOTO",
      sourceStoragePath: "p1",
      filename: "a.jpg",
      mimeType: "image/jpeg",
      driveFileId: "d1",
      inspectionId: "insp1",
    },
    {
      id: "mj2",
      kind: "REPORT",
      sourceStoragePath: "p2",
      filename: "r.pdf",
      mimeType: "application/pdf",
      driveFileId: "d2",
      inspectionId: "insp1",
    },
  ]);
  queueRestoreJobMock.mockResolvedValue("ok");
  const out = await enqueueRestorePlan(
    "org1",
    { type: "org" },
    RestoreMode.MISSING,
    "owner1",
  );
  expect(out).toEqual({ enqueued: 2 });
  expect(queueRestoreJobMock).toHaveBeenCalledTimes(2);
  expect(queueRestoreJobMock).toHaveBeenCalledWith(
    expect.objectContaining({
      orgId: "org1",
      sourceMirrorJobId: "mj1",
      kind: "PHOTO",
      mode: RestoreMode.MISSING,
      sourceStoragePath: "p1",
      filename: "a.jpg",
      mimeType: "image/jpeg",
      driveFileId: "d1",
      inspectionId: "insp1",
      initiatedByUserId: "owner1",
    }),
  );
});
