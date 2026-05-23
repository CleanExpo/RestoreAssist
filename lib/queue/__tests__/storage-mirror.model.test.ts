/**
 * SP-E Block 1 — Prisma model shape test.
 *
 * Confirms the StorageMirrorJob model + enums are wired into the generated
 * Prisma Client. Functional idempotency at the queueMirrorJob layer is
 * tested in Block 3 (storage-mirror.queue.test.ts).
 *
 * The repo runs vitest without a live DB connection in default CI; we
 * verify model presence + enum shape at the type level here.
 */

import { describe, expect, it } from "vitest";
import { MirrorJobKind, MirrorJobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

describe("StorageMirrorJob model — Prisma client wiring", () => {
  it("exposes MirrorJobKind enum with the five expected values", () => {
    expect(MirrorJobKind.PHOTO).toBe("PHOTO");
    expect(MirrorJobKind.REPORT).toBe("REPORT");
    expect(MirrorJobKind.INVOICE).toBe("INVOICE");
    expect(MirrorJobKind.JOB_PACKAGE).toBe("JOB_PACKAGE");
    expect(MirrorJobKind.AUDIT_LOG).toBe("AUDIT_LOG");
  });

  it("exposes MirrorJobStatus enum with the four expected values", () => {
    expect(MirrorJobStatus.PENDING).toBe("PENDING");
    expect(MirrorJobStatus.PROCESSING).toBe("PROCESSING");
    expect(MirrorJobStatus.COMPLETED).toBe("COMPLETED");
    expect(MirrorJobStatus.FAILED).toBe("FAILED");
  });

  it("exposes prisma.storageMirrorJob with the expected delegate methods", () => {
    expect(typeof prisma.storageMirrorJob.create).toBe("function");
    expect(typeof prisma.storageMirrorJob.findFirst).toBe("function");
    expect(typeof prisma.storageMirrorJob.findUnique).toBe("function");
    expect(typeof prisma.storageMirrorJob.updateMany).toBe("function");
    expect(typeof prisma.storageMirrorJob.count).toBe("function");
  });

  it("accepts the documented minimal create input shape (type-only)", () => {
    // Compile-time check — exercises the generated Prisma type.
    const validMinimalInput: Prisma.StorageMirrorJobCreateInput = {
      organization: { connect: { id: "org_123" } },
      kind: MirrorJobKind.PHOTO,
      photoId: "photo_123",
      sourceStoragePath: "org_123/insp_1/photo.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
    };
    expect(validMinimalInput.kind).toBe(MirrorJobKind.PHOTO);
  });
});
