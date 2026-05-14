/**
 * SP-E Block 4 — `enqueueMirror` contract.
 *
 * Verifies:
 *  - GDrive-connected org enqueues a StorageMirrorJob row
 *  - Supabase-only org short-circuits with no enqueue
 *  - Missing orgId is a no-op (returns null)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { organizationMock, queueMirrorJobMock } = vi.hoisted(() => ({
  organizationMock: { findUnique: vi.fn() },
  queueMirrorJobMock: vi.fn(async () => "job_123"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { organization: organizationMock },
}));

vi.mock("@/lib/queue/storage-mirror", () => ({
  queueMirrorJob: queueMirrorJobMock,
}));

import { MirrorJobKind } from "@prisma/client";
import { enqueueMirror } from "@/lib/storage/dual-write";

beforeEach(() => {
  vi.clearAllMocks();
  queueMirrorJobMock.mockResolvedValue("job_123");
});

describe("enqueueMirror", () => {
  it("enqueues a StorageMirrorJob when the org is on GOOGLE_DRIVE", async () => {
    organizationMock.findUnique.mockResolvedValueOnce({
      storageProvider: "GOOGLE_DRIVE",
    });

    const id = await enqueueMirror({
      kind: MirrorJobKind.PHOTO,
      orgId: "org_1",
      storagePath: "org_1/insp_1/photo.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      photoId: "photo_1",
    });

    expect(id).toBe("job_123");
    expect(queueMirrorJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        kind: MirrorJobKind.PHOTO,
        photoId: "photo_1",
        sourceStoragePath: "org_1/insp_1/photo.jpg",
      }),
    );
  });

  it("short-circuits when the org is on SUPABASE — no queue insert", async () => {
    organizationMock.findUnique.mockResolvedValueOnce({
      storageProvider: "SUPABASE",
    });

    const id = await enqueueMirror({
      kind: MirrorJobKind.PHOTO,
      orgId: "org_1",
      storagePath: "p",
      filename: "f.jpg",
      mimeType: "image/jpeg",
      photoId: "photo_1",
    });

    expect(id).toBeNull();
    expect(queueMirrorJobMock).not.toHaveBeenCalled();
  });

  it("returns null and never hits the DB when orgId is missing", async () => {
    const id = await enqueueMirror({
      kind: MirrorJobKind.PHOTO,
      orgId: null,
      storagePath: "p",
      filename: "f.jpg",
      mimeType: "image/jpeg",
      photoId: "photo_1",
    });

    expect(id).toBeNull();
    expect(organizationMock.findUnique).not.toHaveBeenCalled();
    expect(queueMirrorJobMock).not.toHaveBeenCalled();
  });
});
