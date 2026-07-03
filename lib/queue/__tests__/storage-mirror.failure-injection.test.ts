/**
 * SP-E Block 8 Step 3 — Failure injection.
 *
 * Confirms that when the Drive grant is revoked (provider throws
 * `invalid_grant`), the queue:
 *   1. dead-letters the job immediately (skips remaining retries)
 *   2. writes a Notification with the reconnect deep-link
 *   3. uses the "access revoked" copy so the org owner gets the right
 *      remediation prompt
 *
 * This is the unit-test equivalent of the manual Block 8 staging step
 * "temporarily revoke Drive scope → dead-letter Notification appears".
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  storageMirrorJobMock,
  organizationMock,
  notificationMock,
  getMirrorStorageProviderMock,
  uploadToDriveMock,
} = vi.hoisted(() => ({
  storageMirrorJobMock: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  organizationMock: { findUnique: vi.fn(), update: vi.fn() },
  notificationMock: { create: vi.fn() },
  getMirrorStorageProviderMock: vi.fn(),
  uploadToDriveMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageMirrorJob: storageMirrorJobMock,
    organization: organizationMock,
    notification: notificationMock,
    inspection: { findUnique: vi.fn() },
    report: { findUnique: vi.fn() },
    inspectionPhoto: {
      findUnique: vi.fn().mockResolvedValue({
        inspection: { inspectionNumber: "NIR-2026-05-0001", report: null },
      }),
    },
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
import { processNextBatch } from "@/lib/queue/storage-mirror";
import { GoogleDriveStorageProvider } from "@/lib/storage/google-drive-provider";

beforeEach(() => {
  vi.clearAllMocks();
  getMirrorStorageProviderMock.mockResolvedValue(
    new GoogleDriveStorageProvider("org_1"),
  );
  organizationMock.findUnique.mockResolvedValue({
    ownerId: "user_owner",
    storageProviderRefreshToken: "enc:revoked",
    storageProviderAccessToken: "enc:revoked",
  });
});

describe("failure injection — revoked Google Drive scope", () => {
  it("immediately FAILs the job and creates an access-revoked Notification", async () => {
    uploadToDriveMock.mockRejectedValueOnce(
      new Error("invalid_grant: Token has been expired or revoked"),
    );

    storageMirrorJobMock.findMany.mockResolvedValueOnce([{ id: "job_1" }]);
    storageMirrorJobMock.updateMany.mockResolvedValueOnce({ count: 1 });
    storageMirrorJobMock.findUnique.mockResolvedValueOnce({
      id: "job_1",
      orgId: "org_1",
      kind: MirrorJobKind.PHOTO,
      status: MirrorJobStatus.PROCESSING,
      photoId: "photo_1",
      reportId: null,
      invoiceId: null,
      inspectionId: null,
      sourceStoragePath: "p",
      filename: "evidence.jpg",
      mimeType: "image/jpeg",
      driveFileId: null,
      driveViewUrl: null,
      attempts: 0,
      lastError: null,
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(0),
      createdAt: new Date(0),
      updatedAt: new Date(0),
      completedAt: null,
    });
    storageMirrorJobMock.count.mockResolvedValueOnce(0);

    await processNextBatch({ maxJobs: 1 });

    // 1. The job is FAILED, not retried
    const failedUpdate = storageMirrorJobMock.update.mock.calls.find(
      ([arg]) => arg?.data?.status === MirrorJobStatus.FAILED,
    );
    expect(failedUpdate).toBeDefined();

    // 2. Notification routes the owner to /dashboard/settings/storage
    expect(notificationMock.create).toHaveBeenCalledTimes(1);
    const notif = notificationMock.create.mock.calls[0][0].data;
    expect(notif.userId).toBe("user_owner");
    expect(notif.type).toBe("ERROR");
    expect(notif.link).toBe("/dashboard/settings/storage");

    // 3. Copy nudges the user to reconnect (vs generic transient-fail copy)
    expect(notif.title).toMatch(/access revoked/i);
    expect(notif.message.toLowerCase()).toContain("reconnect");

    // 4. RA-6942: the dead Drive grant is cleared so the storage settings UI
    //    stops showing a stale "Connected as …" and reverts to SUPABASE.
    const clearUpdate = organizationMock.update.mock.calls.find(
      ([arg]) => arg?.data?.storageProviderRefreshToken === null,
    );
    expect(clearUpdate).toBeDefined();
    expect(clearUpdate?.[0].data).toMatchObject({
      storageProvider: "SUPABASE",
      storageProviderAccessToken: null,
      storageProviderRefreshToken: null,
      storageProviderTokenExpiresAt: null,
      storageProviderAccountEmail: null,
    });
  });
});
