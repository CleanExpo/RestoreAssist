import { prisma } from "@/lib/prisma";
import { MirrorJobStatus, RestoreMode, Prisma } from "@prisma/client";
import { queueRestoreJob } from "@/lib/queue/storage-restore";

export type RestoreScope =
  | { type: "org" }
  | { type: "inspection"; inspectionId: string };

function whereForScope(
  orgId: string,
  scope: RestoreScope,
): Prisma.StorageMirrorJobWhereInput {
  const base: Prisma.StorageMirrorJobWhereInput = {
    orgId,
    status: MirrorJobStatus.COMPLETED,
    driveFileId: { not: null },
  };
  if (scope.type === "inspection") base.inspectionId = scope.inspectionId;
  return base;
}

export async function computeRestorePlan(
  orgId: string,
  scope: RestoreScope,
): Promise<{ fileCount: number }> {
  const fileCount = await prisma.storageMirrorJob.count({
    where: whereForScope(orgId, scope),
  });
  return { fileCount };
}

export async function enqueueRestorePlan(
  orgId: string,
  scope: RestoreScope,
  mode: RestoreMode,
  initiatedByUserId: string,
): Promise<{ enqueued: number }> {
  const rows = await prisma.storageMirrorJob.findMany({
    where: whereForScope(orgId, scope),
    select: {
      id: true,
      kind: true,
      sourceStoragePath: true,
      filename: true,
      mimeType: true,
      driveFileId: true,
      inspectionId: true,
    },
  });

  let enqueued = 0;
  for (const r of rows) {
    if (!r.driveFileId) continue;
    await queueRestoreJob({
      orgId,
      sourceMirrorJobId: r.id,
      kind: r.kind,
      mode,
      sourceStoragePath: r.sourceStoragePath,
      filename: r.filename,
      mimeType: r.mimeType,
      driveFileId: r.driveFileId,
      inspectionId: r.inspectionId,
      initiatedByUserId,
      expectedSha256: null,
    });
    enqueued++;
  }
  return { enqueued };
}
