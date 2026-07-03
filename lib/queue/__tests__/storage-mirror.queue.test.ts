/**
 * SP-E Block 3 — Storage mirror queue behaviour.
 *
 * Exercises queueMirrorJob + processNextBatch with prisma mocked. We
 * don't hit a live DB in unit tests — the integration test suite (RA's
 * `pnpm test:integration`) verifies the constraint at the Postgres
 * layer. Here we pin the four contract paths:
 *
 *   1. Happy path: enqueue → claim → upload → COMPLETED with driveFileId
 *   2. Retry path: upload throws transient → row stays PENDING, attempts++
 *   3. Dead-letter: 5 failures → status FAILED + Notification row
 *   4. Idempotency: P2002 on second enqueue returns the existing id
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { circuitBreakerManager } from "@/lib/integrations/circuit-breaker";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const {
  storageMirrorJobMock,
  organizationMock,
  inspectionMock,
  reportMock,
  inspectionPhotoMock,
  notificationMock,
  getMirrorStorageProviderMock,
  uploadToDriveMock,
} = vi.hoisted(() => ({
  storageMirrorJobMock: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  organizationMock: { findUnique: vi.fn(), update: vi.fn() },
  inspectionMock: { findUnique: vi.fn() },
  reportMock: { findUnique: vi.fn() },
  inspectionPhotoMock: { findUnique: vi.fn() },
  notificationMock: { create: vi.fn() },
  getMirrorStorageProviderMock: vi.fn(),
  uploadToDriveMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageMirrorJob: storageMirrorJobMock,
    organization: organizationMock,
    inspection: inspectionMock,
    report: reportMock,
    inspectionPhoto: inspectionPhotoMock,
    notification: notificationMock,
  },
}));

vi.mock("@/lib/credential-vault", () => ({
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
  encrypt: vi.fn((v: string) => `enc:${v}`),
}));

vi.mock("@/lib/storage/supabase-provider", () => ({
  SupabaseStorageProvider: vi.fn().mockImplementation(function () {
    return ({
    download: vi.fn(async () => Buffer.from("photo-bytes")),
  });
  }),
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>(
    "@/lib/storage",
  );
  return {
    ...actual,
    getMirrorStorageProvider: getMirrorStorageProviderMock,
  };
});

vi.mock("@/lib/cloud-mirror/drive", () => ({
  uploadToDrive: uploadToDriveMock,
}));

import { MirrorJobKind, MirrorJobStatus } from "@prisma/client";
import {
  queueMirrorJob,
  processNextBatch,
} from "@/lib/queue/storage-mirror";
import { GoogleDriveStorageProvider } from "@/lib/storage/google-drive-provider";

function fakeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    orgId: "org_1",
    kind: MirrorJobKind.PHOTO,
    status: MirrorJobStatus.PENDING,
    photoId: "photo_1",
    reportId: null,
    invoiceId: null,
    inspectionId: null,
    sourceStoragePath: "org_1/insp_1/photo.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    driveFileId: null,
    driveViewUrl: null,
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    nextAttemptAt: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    completedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The google-drive-mirror circuit breaker is a process-level singleton; reset
  // it so a prior test that opens it (e.g. the 5-attempt dead-letter case) can't
  // leak an OPEN state into the next test and mask the real upload error.
  circuitBreakerManager.resetAll();
  getMirrorStorageProviderMock.mockResolvedValue(
    new GoogleDriveStorageProvider("org_1"),
  );
  uploadToDriveMock.mockResolvedValue({
    providerFileId: "drive-file-1",
    viewUrl: "https://drive.google.com/file/d/drive-file-1/view",
  });
  organizationMock.findUnique.mockResolvedValue({
    ownerId: "user_1",
    storageProviderRefreshToken: "enc:refresh",
    storageProviderAccessToken: "enc:access",
  });
  inspectionPhotoMock.findUnique.mockResolvedValue({
    inspection: { inspectionNumber: "NIR-2026-05-0001", report: null },
  });
});

describe("queueMirrorJob — idempotency", () => {
  it("returns the new job id on first enqueue", async () => {
    storageMirrorJobMock.create.mockResolvedValueOnce({ id: "job_new" });

    const id = await queueMirrorJob({
      orgId: "org_1",
      kind: MirrorJobKind.PHOTO,
      sourceStoragePath: "p",
      filename: "f.jpg",
      mimeType: "image/jpeg",
      photoId: "photo_1",
    });

    expect(id).toBe("job_new");
    expect(storageMirrorJobMock.create).toHaveBeenCalledTimes(1);
  });

  it("returns the existing job id when P2002 fires on the composite unique", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "x" },
    );
    storageMirrorJobMock.create.mockRejectedValueOnce(p2002);
    storageMirrorJobMock.findFirst.mockResolvedValueOnce({ id: "job_existing" });

    const id = await queueMirrorJob({
      orgId: "org_1",
      kind: MirrorJobKind.PHOTO,
      sourceStoragePath: "p",
      filename: "f.jpg",
      mimeType: "image/jpeg",
      photoId: "photo_1",
    });

    expect(id).toBe("job_existing");
    expect(storageMirrorJobMock.findFirst).toHaveBeenCalledTimes(1);
  });

  it("re-throws non-P2002 errors", async () => {
    storageMirrorJobMock.create.mockRejectedValueOnce(new Error("boom"));
    await expect(
      queueMirrorJob({
        orgId: "org_1",
        kind: MirrorJobKind.PHOTO,
        sourceStoragePath: "p",
        filename: "f.jpg",
        mimeType: "image/jpeg",
        photoId: "photo_1",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("processNextBatch — happy path", () => {
  it("marks job COMPLETED and records driveFileId after a successful upload", async () => {
    storageMirrorJobMock.findMany.mockResolvedValueOnce([{ id: "job_1" }]);
    storageMirrorJobMock.updateMany.mockResolvedValueOnce({ count: 1 });
    storageMirrorJobMock.findUnique.mockResolvedValueOnce(fakeJob());
    storageMirrorJobMock.count.mockResolvedValueOnce(0);

    const stats = await processNextBatch({ maxJobs: 10 });

    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(0);
    expect(uploadToDriveMock).toHaveBeenCalledTimes(1);
    expect(storageMirrorJobMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job_1" },
        data: expect.objectContaining({
          status: MirrorJobStatus.COMPLETED,
          driveFileId: "drive-file-1",
          driveViewUrl: "https://drive.google.com/file/d/drive-file-1/view",
        }),
      }),
    );
  });
});

describe("processNextBatch — retry path", () => {
  it("leaves status PENDING and increments attempts on a transient failure", async () => {
    uploadToDriveMock.mockRejectedValueOnce(new Error("503 Service Unavailable"));

    storageMirrorJobMock.findMany.mockResolvedValueOnce([{ id: "job_1" }]);
    storageMirrorJobMock.updateMany.mockResolvedValueOnce({ count: 1 });
    storageMirrorJobMock.findUnique.mockResolvedValueOnce(fakeJob());
    storageMirrorJobMock.count.mockResolvedValueOnce(1);

    const stats = await processNextBatch({ maxJobs: 10 });

    expect(stats.failed).toBe(1);
    const updateCall = storageMirrorJobMock.update.mock.calls.find(
      ([arg]) => arg?.data?.status === MirrorJobStatus.PENDING,
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[0].data.attempts).toBe(1);
    expect(updateCall?.[0].data.nextAttemptAt).toBeInstanceOf(Date);
    expect(notificationMock.create).not.toHaveBeenCalled();
  });
});

describe("processNextBatch — dead-letter path", () => {
  it("marks FAILED and creates a Notification after 5 attempts", async () => {
    uploadToDriveMock.mockRejectedValueOnce(new Error("503 outage"));

    storageMirrorJobMock.findMany.mockResolvedValueOnce([{ id: "job_1" }]);
    storageMirrorJobMock.updateMany.mockResolvedValueOnce({ count: 1 });
    storageMirrorJobMock.findUnique.mockResolvedValueOnce(
      fakeJob({ attempts: 4 }), // → newAttempts === 5
    );
    storageMirrorJobMock.count.mockResolvedValueOnce(0);

    await processNextBatch({ maxJobs: 10 });

    const failedUpdate = storageMirrorJobMock.update.mock.calls.find(
      ([arg]) => arg?.data?.status === MirrorJobStatus.FAILED,
    );
    expect(failedUpdate).toBeDefined();
    expect(notificationMock.create).toHaveBeenCalledTimes(1);
    expect(notificationMock.create.mock.calls[0][0].data.link).toBe(
      "/dashboard/settings/storage",
    );
  });

  it("dead-letters immediately on invalid_grant", async () => {
    uploadToDriveMock.mockRejectedValueOnce(
      new Error("invalid_grant: token revoked"),
    );

    storageMirrorJobMock.findMany.mockResolvedValueOnce([{ id: "job_1" }]);
    storageMirrorJobMock.updateMany.mockResolvedValueOnce({ count: 1 });
    storageMirrorJobMock.findUnique.mockResolvedValueOnce(
      fakeJob({ attempts: 0 }), // first attempt
    );
    storageMirrorJobMock.count.mockResolvedValueOnce(0);

    await processNextBatch({ maxJobs: 10 });

    const failedUpdate = storageMirrorJobMock.update.mock.calls.find(
      ([arg]) => arg?.data?.status === MirrorJobStatus.FAILED,
    );
    expect(failedUpdate).toBeDefined();
    expect(notificationMock.create.mock.calls[0][0].data.title).toMatch(
      /access revoked/i,
    );
  });
});
