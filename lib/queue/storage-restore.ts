/**
 * Task 5: Restore queue — durable, Prisma-backed background queue that
 * restores Drive-resident assets back to Supabase storage.
 *
 * Mirrors `lib/queue/storage-mirror.ts` exactly:
 *  - optimistic-lock claim (PENDING → PROCESSING)
 *  - exponential backoff + dead-letter on MAX_ATTEMPTS or invalid_grant
 *  - P2002 idempotency on (orgId, sourceMirrorJobId) unique
 *  - chain-of-custody audit row per COMPLETED restore
 *
 * Invoked from:
 *  - `app/api/cron/storage-restore/route.ts` — Vercel cron tick
 *  - Restore initiation routes (fire-and-forget enqueue)
 */

import { prisma } from "@/lib/prisma";
import {
  MirrorJobKind,
  RestoreJobStatus,
  RestoreMode,
  Prisma,
  type StorageRestoreJob,
} from "@prisma/client";
import { rehydrateOne } from "@/lib/restore/rehydrate";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30s × 2^attempt, capped at 30 min
const BACKOFF_CAP_MS = 30 * 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnqueueRestoreInput {
  orgId: string;
  sourceMirrorJobId: string;
  kind: MirrorJobKind;
  mode: RestoreMode;
  /** Path inside the Drive bucket (source) */
  sourceStoragePath: string;
  filename: string;
  mimeType: string;
  driveFileId: string;
  inspectionId?: string | null;
  initiatedByUserId?: string | null;
  expectedSha256?: string | null;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Insert a new restore job. Idempotent on (orgId, sourceMirrorJobId):
 * a duplicate enqueue returns the existing job id.
 */
export async function queueRestoreJob(
  input: EnqueueRestoreInput,
): Promise<string> {
  try {
    const job = await prisma.storageRestoreJob.create({
      data: {
        orgId: input.orgId,
        sourceMirrorJobId: input.sourceMirrorJobId,
        kind: input.kind,
        mode: input.mode,
        sourceStoragePath: input.sourceStoragePath,
        filename: input.filename,
        mimeType: input.mimeType,
        driveFileId: input.driveFileId,
        inspectionId: input.inspectionId ?? null,
        initiatedByUserId: input.initiatedByUserId ?? null,
        expectedSha256: input.expectedSha256 ?? null,
      },
      select: { id: true },
    });
    return job.id;
  } catch (err) {
    // P2002 = composite unique violation → idempotent re-enqueue.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.storageRestoreJob.findFirst({
        where: { orgId: input.orgId, sourceMirrorJobId: input.sourceMirrorJobId },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw err;
  }
}

// ─── Processing ───────────────────────────────────────────────────────────────

/**
 * Claim the next batch of PENDING jobs whose `nextAttemptAt <= now()` and
 * restore each via rehydrateOne. Returns counters for cron reporting.
 */
export async function processNextRestoreBatch(
  options: { maxJobs?: number } = {},
): Promise<{
  processed: number;
  failed: number;
  skipped: number;
  remaining: number;
}> {
  const { maxJobs = 50 } = options;

  const candidates = await prisma.storageRestoreJob.findMany({
    where: {
      status: RestoreJobStatus.PENDING,
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: maxJobs,
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const { id } of candidates) {
    // Optimistic lock — only the worker that flips PENDING→PROCESSING gets the row.
    const locked = await prisma.storageRestoreJob.updateMany({
      where: { id, status: RestoreJobStatus.PENDING },
      data: { status: RestoreJobStatus.PROCESSING, lastAttemptAt: new Date() },
    });
    if (locked.count === 0) continue;

    const job = await prisma.storageRestoreJob.findUnique({ where: { id } });
    if (!job) continue;

    try {
      const outcome = await rehydrateOne(job);

      await prisma.storageRestoreJob.update({
        where: { id: job.id },
        data:
          outcome.status === "SKIPPED"
            ? {
                status: RestoreJobStatus.SKIPPED,
                completedAt: new Date(),
                lastError: null,
              }
            : {
                status: RestoreJobStatus.COMPLETED,
                completedAt: new Date(),
                restoredBytes: outcome.restoredBytes,
                restoredSha256: outcome.restoredSha256,
                lastError: null,
              },
      });

      // Chain-of-custody: write an audit row for each real restore.
      // auditLog.inspectionId is a required FK — only write when both
      // inspectionId and initiatedByUserId are present on the job.
      // Never let an audit failure fail the restore job.
      if (
        outcome.status !== "SKIPPED" &&
        job.inspectionId &&
        job.initiatedByUserId
      ) {
        try {
          await prisma.auditLog.create({
            data: {
              inspectionId: job.inspectionId,
              action: "STORAGE_FILE_RESTORED_FROM_DRIVE",
              entityType: "StorageRestoreJob",
              entityId: job.id,
              userId: job.initiatedByUserId,
              changes: JSON.stringify({
                kind: job.kind,
                path: job.sourceStoragePath,
                bytes: outcome.restoredBytes,
                sha256: outcome.restoredSha256,
                mode: job.mode,
              }),
            },
          });
        } catch (auditErr) {
          console.error(
            `[Storage Restore] audit write failed for ${job.id}:`,
            auditErr,
          );
        }
      }

      if (outcome.status === "SKIPPED") {
        skipped++;
      } else {
        processed++;
      }
    } catch (err) {
      await handleRestoreFailure(job, err);
      failed++;
    }
  }

  const remaining = await prisma.storageRestoreJob.count({
    where: {
      status: { in: [RestoreJobStatus.PENDING, RestoreJobStatus.PROCESSING] },
    },
  });

  console.log(
    `[Storage Restore] Batch: ${processed} restored, ${skipped} skipped, ${failed} failed, ${remaining} remaining`,
  );

  return { processed, failed, skipped, remaining };
}

async function handleRestoreFailure(
  job: StorageRestoreJob,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const newAttempts = job.attempts + 1;

  // `invalid_grant` (revoked refresh token) is permanent — dead-letter immediately.
  const isInvalidGrant = /invalid_grant/i.test(message);
  const isPermanent = isInvalidGrant || newAttempts >= MAX_ATTEMPTS;

  if (isPermanent) {
    await prisma.storageRestoreJob.update({
      where: { id: job.id },
      data: {
        status: RestoreJobStatus.FAILED,
        attempts: newAttempts,
        lastError: message,
      },
    });

    console.error(
      `[DEAD-LETTER] [Storage Restore] Job ${job.id} failed permanently (attempts=${newAttempts}, org=${job.orgId}): ${message}`,
    );

    try {
      const org = await prisma.organization.findUnique({
        where: { id: job.orgId },
        select: { ownerId: true },
      });
      if (org?.ownerId) {
        const title = isInvalidGrant
          ? "Google Drive access revoked"
          : `Restore failed for ${job.filename}`;
        const body = isInvalidGrant
          ? "Your Google Drive grant was revoked — reconnect at Settings → Storage to resume restores."
          : `Failed to restore ${job.kind} (${job.filename}) from Google Drive after ${newAttempts} attempts. Last error: ${message.slice(0, 200)}.`;
        await prisma.notification.create({
          data: {
            userId: org.ownerId,
            type: "ERROR",
            title,
            message: body,
            link: "/dashboard/settings/storage",
          },
        });
      }
    } catch (notifyErr) {
      console.error(
        `[DEAD-LETTER] [Storage Restore] notify failed for ${job.id}:`,
        notifyErr,
      );
    }
    return;
  }

  // Transient — schedule a retry with exponential backoff.
  const delay = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1),
    BACKOFF_CAP_MS,
  );
  await prisma.storageRestoreJob.update({
    where: { id: job.id },
    data: {
      status: RestoreJobStatus.PENDING,
      attempts: newAttempts,
      lastError: message,
      nextAttemptAt: new Date(Date.now() + delay),
    },
  });

  console.log(
    `[Storage Restore] Job ${job.id} retry ${newAttempts}/${MAX_ATTEMPTS} scheduled in ${delay}ms`,
  );
}

// ─── Management helpers ───────────────────────────────────────────────────────

export async function getRestoreQueueStats(orgId: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  skipped: number;
  failed: number;
  lastCompletedAt: Date | null;
}> {
  const [total, pending, processing, completed, skipped, failed, last] =
    await Promise.all([
      prisma.storageRestoreJob.count({ where: { orgId } }),
      prisma.storageRestoreJob.count({
        where: { orgId, status: RestoreJobStatus.PENDING },
      }),
      prisma.storageRestoreJob.count({
        where: { orgId, status: RestoreJobStatus.PROCESSING },
      }),
      prisma.storageRestoreJob.count({
        where: { orgId, status: RestoreJobStatus.COMPLETED },
      }),
      prisma.storageRestoreJob.count({
        where: { orgId, status: RestoreJobStatus.SKIPPED },
      }),
      prisma.storageRestoreJob.count({
        where: { orgId, status: RestoreJobStatus.FAILED },
      }),
      prisma.storageRestoreJob.findFirst({
        where: { orgId, status: RestoreJobStatus.COMPLETED },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);

  return {
    total,
    pending,
    processing,
    completed,
    skipped,
    failed,
    lastCompletedAt: last?.completedAt ?? null,
  };
}

export async function retryRestoreJob(jobId: string): Promise<boolean> {
  const result = await prisma.storageRestoreJob.updateMany({
    where: { id: jobId, status: RestoreJobStatus.FAILED },
    data: {
      status: RestoreJobStatus.PENDING,
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  });
  return result.count > 0;
}
