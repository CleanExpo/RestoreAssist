/**
 * Task 5 — StorageRestoreJob queue behaviour.
 *
 * Mirrors storage-mirror.queue.test.ts structure. Covers:
 *   1. Enqueue returns new id
 *   2. P2002 idempotent re-enqueue
 *   3. COMPLETED marks job + writes audit row; SKIPPED counted separately
 *   4. invalid_grant dead-letters immediately + owner notification
 *   5. Transient failure reschedules PENDING with backoff
 *   6. retryRestoreJob resets FAILED → PENDING
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma, RestoreMode } from "@prisma/client";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  rehydrateOneMock,
  storageRestoreJobMock,
  organizationMock,
  notificationMock,
  auditLogMock,
} = vi.hoisted(() => ({
  rehydrateOneMock: vi.fn(),
  storageRestoreJobMock: {
    create: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  organizationMock: { findUnique: vi.fn() },
  notificationMock: { create: vi.fn() },
  auditLogMock: { create: vi.fn() },
}));

vi.mock("@/lib/restore/rehydrate", () => ({
  rehydrateOne: (...a: unknown[]) => rehydrateOneMock(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageRestoreJob: storageRestoreJobMock,
    organization: organizationMock,
    notification: notificationMock,
    auditLog: auditLogMock,
  },
}));

import {
  queueRestoreJob,
  processNextRestoreBatch,
  retryRestoreJob,
} from "@/lib/queue/storage-restore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(over: Record<string, unknown> = {}) {
  return {
    id: "rj1",
    orgId: "org1",
    sourceMirrorJobId: "mj1",
    kind: "PHOTO",
    mode: RestoreMode.MISSING,
    status: "PROCESSING",
    attempts: 0,
    sourceStoragePath: "p",
    filename: "f",
    mimeType: "image/jpeg",
    driveFileId: "d",
    inspectionId: "insp1",
    initiatedByUserId: "owner1",
    expectedSha256: null,
    ...over,
  };
}

beforeEach(() => {
  storageRestoreJobMock.create.mockReset();
  storageRestoreJobMock.findMany.mockReset();
  storageRestoreJobMock.updateMany.mockReset();
  storageRestoreJobMock.findUnique.mockReset();
  storageRestoreJobMock.update.mockReset();
  storageRestoreJobMock.count.mockReset();
  storageRestoreJobMock.findFirst.mockReset();
  organizationMock.findUnique.mockReset();
  notificationMock.create.mockReset();
  auditLogMock.create.mockReset();
  rehydrateOneMock.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("queueRestoreJob", () => {
  it("enqueues a job and returns its id", async () => {
    storageRestoreJobMock.create.mockResolvedValue({ id: "rj1" });
    await expect(
      queueRestoreJob({
        orgId: "org1",
        sourceMirrorJobId: "mj1",
        kind: "PHOTO" as any,
        mode: RestoreMode.MISSING,
        sourceStoragePath: "p",
        filename: "f",
        mimeType: "image/jpeg",
        driveFileId: "d",
      }),
    ).resolves.toBe("rj1");
  });

  it("idempotent re-enqueue on P2002 returns existing id", async () => {
    storageRestoreJobMock.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
      }),
    );
    storageRestoreJobMock.findFirst.mockResolvedValue({ id: "existing" });
    await expect(
      queueRestoreJob({
        orgId: "org1",
        sourceMirrorJobId: "mj1",
        kind: "PHOTO" as any,
        mode: RestoreMode.MISSING,
        sourceStoragePath: "p",
        filename: "f",
        mimeType: "image/jpeg",
        driveFileId: "d",
      }),
    ).resolves.toBe("existing");
  });
});

describe("processNextRestoreBatch", () => {
  it("COMPLETED on success, SKIPPED counted separately", async () => {
    storageRestoreJobMock.findMany.mockResolvedValue([{ id: "rj1" }]);
    storageRestoreJobMock.updateMany.mockResolvedValue({ count: 1 });
    storageRestoreJobMock.findUnique.mockResolvedValue(row());
    storageRestoreJobMock.count.mockResolvedValue(0);
    rehydrateOneMock.mockResolvedValue({
      status: "COMPLETED",
      restoredBytes: 5,
      restoredSha256: "abc",
    });

    const stats = await processNextRestoreBatch();

    expect(stats.processed).toBe(1);
    expect(stats.skipped).toBe(0);
    expect(storageRestoreJobMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(auditLogMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STORAGE_FILE_RESTORED_FROM_DRIVE",
          userId: "owner1",
          inspectionId: "insp1",
        }),
      }),
    );
  });

  it("invalid_grant dead-letters immediately and notifies the owner", async () => {
    storageRestoreJobMock.findMany.mockResolvedValue([{ id: "rj1" }]);
    storageRestoreJobMock.updateMany.mockResolvedValue({ count: 1 });
    storageRestoreJobMock.findUnique.mockResolvedValue(row({ attempts: 0 }));
    storageRestoreJobMock.count.mockResolvedValue(0);
    organizationMock.findUnique.mockResolvedValue({ ownerId: "owner1" });
    rehydrateOneMock.mockRejectedValue(new Error("invalid_grant: revoked"));

    await processNextRestoreBatch();

    expect(storageRestoreJobMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(notificationMock.create).toHaveBeenCalled();
  });

  it("transient failure reschedules PENDING with backoff", async () => {
    storageRestoreJobMock.findMany.mockResolvedValue([{ id: "rj1" }]);
    storageRestoreJobMock.updateMany.mockResolvedValue({ count: 1 });
    storageRestoreJobMock.findUnique.mockResolvedValue(row({ attempts: 0 }));
    storageRestoreJobMock.count.mockResolvedValue(1);
    rehydrateOneMock.mockRejectedValue(new Error("503 transient"));

    await processNextRestoreBatch();

    expect(storageRestoreJobMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING", attempts: 1 }),
      }),
    );
  });
});

describe("retryRestoreJob", () => {
  it("resets a FAILED job to PENDING", async () => {
    storageRestoreJobMock.updateMany.mockResolvedValue({ count: 1 });
    await expect(retryRestoreJob("rj1")).resolves.toBe(true);
  });
});
