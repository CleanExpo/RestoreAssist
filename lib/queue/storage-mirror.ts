/**
 * SP-E: Storage BYOK Mirror Queue.
 *
 * Durable, Prisma-backed background queue that mirrors Supabase-resident
 * assets to a tenant's connected Google Drive. Modelled exactly on
 * `lib/integrations/sync-queue.ts` (priority lock + retry + dead-letter).
 *
 * The mirror queue is invoked from:
 *  - `app/api/cron/storage-mirror/route.ts` — Vercel cron tick (every minute)
 *  - `lib/storage/dual-write.ts` — fire-and-forget enqueue from photo /
 *    report / invoice routes
 *  - `lib/queue/exportClosedJobToBYOKStorage.ts` — close-package enqueue
 *
 * Idempotency is enforced by the Postgres composite unique on
 * (orgId, kind, photoId, reportId, invoiceId, inspectionId).
 */

import { prisma } from "@/lib/prisma";
import {
  MirrorJobKind,
  MirrorJobStatus,
  Prisma,
  type StorageMirrorJob,
} from "@prisma/client";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";
import { getMirrorStorageProvider } from "@/lib/storage";
import { GoogleDriveStorageProvider } from "@/lib/storage/google-drive-provider";
import { withRateLimit } from "@/lib/integrations/rate-limiter";
import {
  withCircuitBreaker,
  DEFAULT_CIRCUIT_OPTIONS,
} from "@/lib/integrations/circuit-breaker";
import { uploadToDrive } from "@/lib/cloud-mirror/drive";
import { decrypt } from "@/lib/credential-vault";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30s × 2^attempt, capped at 30 min
const BACKOFF_CAP_MS = 30 * 60_000;
const CIRCUIT_KEY = "google-drive-mirror";
const RATE_KEY = "GOOGLE_DRIVE";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnqueueInput {
  orgId: string;
  kind: MirrorJobKind;
  /** Source path inside the Supabase originals bucket */
  sourceStoragePath: string;
  filename: string;
  mimeType: string;
  // Exactly ONE of these is set, matching `kind`.
  photoId?: string | null;
  reportId?: string | null;
  invoiceId?: string | null;
  inspectionId?: string | null;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Insert a new mirror job. Idempotent on the composite unique
 * (orgId, kind, photoId, reportId, invoiceId, inspectionId): a duplicate
 * enqueue for the same source row returns the existing job id.
 */
export async function queueMirrorJob(input: EnqueueInput): Promise<string> {
  try {
    const job = await prisma.storageMirrorJob.create({
      data: {
        orgId: input.orgId,
        kind: input.kind,
        sourceStoragePath: input.sourceStoragePath,
        filename: input.filename,
        mimeType: input.mimeType,
        photoId: input.photoId ?? null,
        reportId: input.reportId ?? null,
        invoiceId: input.invoiceId ?? null,
        inspectionId: input.inspectionId ?? null,
      },
      select: { id: true },
    });
    console.log(
      `[Storage Mirror] Queued ${input.kind} job ${job.id} for org ${input.orgId}`,
    );
    return job.id;
  } catch (err) {
    // P2002 = composite unique violation → idempotent re-enqueue.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.storageMirrorJob.findFirst({
        where: {
          orgId: input.orgId,
          kind: input.kind,
          photoId: input.photoId ?? null,
          reportId: input.reportId ?? null,
          invoiceId: input.invoiceId ?? null,
          inspectionId: input.inspectionId ?? null,
        },
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
 * push them to Drive. Returns counters for cron reporting.
 */
export async function processNextBatch(
  options: { maxJobs?: number } = {},
): Promise<{ processed: number; failed: number; remaining: number }> {
  const { maxJobs = 50 } = options;

  const candidates = await prisma.storageMirrorJob.findMany({
    where: {
      status: MirrorJobStatus.PENDING,
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: maxJobs,
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;

  for (const { id } of candidates) {
    // Optimistic lock — only the worker that flips PENDING→PROCESSING
    // gets the row.
    const locked = await prisma.storageMirrorJob.updateMany({
      where: { id, status: MirrorJobStatus.PENDING },
      data: {
        status: MirrorJobStatus.PROCESSING,
        lastAttemptAt: new Date(),
      },
    });
    if (locked.count === 0) continue;

    const job = await prisma.storageMirrorJob.findUnique({ where: { id } });
    if (!job) continue;

    try {
      await processJob(job);
      processed++;
    } catch {
      failed++;
    }
  }

  const remaining = await prisma.storageMirrorJob.count({
    where: {
      status: { in: [MirrorJobStatus.PENDING, MirrorJobStatus.PROCESSING] },
    },
  });

  console.log(
    `[Storage Mirror] Batch complete: ${processed} processed, ${failed} failed, ${remaining} remaining`,
  );

  return { processed, failed, remaining };
}

async function processJob(job: StorageMirrorJob): Promise<void> {
  try {
    // Resolve org's mirror provider — must be Google Drive in v1.
    const provider = await getMirrorStorageProvider(job.orgId);
    if (!provider || !(provider instanceof GoogleDriveStorageProvider)) {
      throw new Error(
        `Org ${job.orgId} has no Google Drive mirror configured`,
      );
    }

    // Pull the original bytes from Supabase. The supabase provider's
    // download() handles signed-URL acquisition internally.
    const supabase = new SupabaseStorageProvider();
    const buffer = await supabase.download(job.sourceStoragePath);

    // Resolve the org's encrypted tokens directly — we delegate to the
    // shared uploadToDrive helper rather than the provider's upload()
    // method because the mirror queue knows the right jobNumber (from
    // the photo/inspection FK), which the StorageProvider interface
    // doesn't expose.
    const org = await prisma.organization.findUnique({
      where: { id: job.orgId },
      select: {
        storageProviderRefreshToken: true,
        storageProviderAccessToken: true,
      },
    });
    if (!org?.storageProviderRefreshToken) {
      throw new Error(
        `[invalid_grant] Drive not connected for org ${job.orgId}`,
      );
    }
    const refreshToken = decrypt(org.storageProviderRefreshToken);
    const accessToken = org.storageProviderAccessToken
      ? decrypt(org.storageProviderAccessToken)
      : "";

    // Folder convention: RestoreAssist/<jobNumber>/<filename>. JOB_PACKAGE
    // and PHOTO/REPORT/INVOICE all hang off the same job folder.
    const jobNumber = await resolveJobNumber(job);

    // Wrap the actual network write in rate-limit + circuit-breaker so a
    // Drive outage cascades nicely instead of burning the whole batch.
    const { providerFileId, viewUrl } = await withRateLimit(
      RATE_KEY,
      async () =>
        withCircuitBreaker(
          CIRCUIT_KEY,
          async () =>
            uploadToDrive({
              accessToken,
              refreshToken,
              jobNumber,
              filename: job.filename,
              mimeType: job.mimeType,
              data: buffer,
            }),
          DEFAULT_CIRCUIT_OPTIONS,
        ),
    );

    await prisma.storageMirrorJob.update({
      where: { id: job.id },
      data: {
        status: MirrorJobStatus.COMPLETED,
        completedAt: new Date(),
        driveFileId: providerFileId,
        driveViewUrl: viewUrl,
        lastError: null,
      },
    });

    console.log(
      `[Storage Mirror] Completed job ${job.id} → Drive file ${providerFileId}`,
    );
  } catch (err) {
    await handleJobFailure(job, err);
    throw err;
  }
}

async function resolveJobNumber(job: StorageMirrorJob): Promise<string> {
  // Prefer Report.jobNumber → fall back to inspectionNumber → inspection id.
  if (job.reportId) {
    const r = await prisma.report.findUnique({
      where: { id: job.reportId },
      select: { jobNumber: true, reportNumber: true },
    });
    if (r?.jobNumber) return r.jobNumber;
    if (r?.reportNumber) return r.reportNumber;
  }
  if (job.inspectionId) {
    const i = await prisma.inspection.findUnique({
      where: { id: job.inspectionId },
      select: {
        inspectionNumber: true,
        report: { select: { jobNumber: true } },
      },
    });
    if (i?.report?.jobNumber) return i.report.jobNumber;
    if (i?.inspectionNumber) return i.inspectionNumber;
  }
  if (job.photoId) {
    const p = await prisma.inspectionPhoto.findUnique({
      where: { id: job.photoId },
      select: {
        inspection: {
          select: {
            inspectionNumber: true,
            report: { select: { jobNumber: true } },
          },
        },
      },
    });
    if (p?.inspection?.report?.jobNumber) return p.inspection.report.jobNumber;
    if (p?.inspection?.inspectionNumber) return p.inspection.inspectionNumber;
  }
  // Last resort — keep the file in a recognisable bucket so it isn't lost.
  return `unfiled-${job.orgId}`;
}

async function handleJobFailure(
  job: StorageMirrorJob,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const newAttempts = job.attempts + 1;

  // `invalid_grant` (revoked refresh token) is permanent — skip remaining
  // retries and dead-letter immediately. This mirrors sync-queue.ts:215.
  const isInvalidGrant = /invalid_grant/i.test(message);
  const isPermanent = isInvalidGrant || newAttempts >= MAX_ATTEMPTS;

  if (isPermanent) {
    // `invalid_grant` means the org's Drive refresh token is dead. Clear the
    // stored token fields so the storage settings UI stops showing a stale
    // "Connected as …" and prompts a reconnect. Reverts to SUPABASE so the
    // mirror queue no longer targets a provider the org can't reach.
    if (isInvalidGrant) {
      await prisma.organization.update({
        where: { id: job.orgId },
        data: {
          storageProvider: "SUPABASE",
          storageProviderAccessToken: null,
          storageProviderRefreshToken: null,
          storageProviderTokenExpiresAt: null,
          storageProviderAccountEmail: null,
        },
      });
    }

    await prisma.storageMirrorJob.update({
      where: { id: job.id },
      data: {
        status: MirrorJobStatus.FAILED,
        attempts: newAttempts,
        lastError: message,
      },
    });

    console.error(
      `[DEAD-LETTER] [Storage Mirror] Job ${job.id} permanently failed (attempts=${newAttempts}, kind=${job.kind}, org=${job.orgId}): ${message}`,
    );

    try {
      const org = await prisma.organization.findUnique({
        where: { id: job.orgId },
        select: { ownerId: true },
      });
      if (org?.ownerId) {
        const title = isInvalidGrant
          ? "Google Drive access revoked"
          : `Drive mirror failed for ${job.filename}`;
        const body = isInvalidGrant
          ? `Your Google Drive grant was revoked — reconnect at Settings → Storage to resume the mirror queue.`
          : `Failed to mirror ${job.kind} (${job.filename}) to Google Drive after ${newAttempts} attempts. Last error: ${message.slice(0, 200)}.`;
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
        `[DEAD-LETTER] [Storage Mirror] Notification failed for job ${job.id}:`,
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
  const nextAttemptAt = new Date(Date.now() + delay);

  await prisma.storageMirrorJob.update({
    where: { id: job.id },
    data: {
      status: MirrorJobStatus.PENDING,
      attempts: newAttempts,
      lastError: message,
      nextAttemptAt,
    },
  });

  console.log(
    `[Storage Mirror] Job ${job.id} retry ${newAttempts}/${MAX_ATTEMPTS} scheduled at ${nextAttemptAt.toISOString()}`,
  );
}

// ─── Management helpers (used by /dashboard/settings/storage) ────────────────

export async function getMirrorQueueStats(orgId: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  lastCompletedAt: Date | null;
  totalBytesMirrored: number;
}> {
  const [total, pending, processing, completed, failed, last] =
    await Promise.all([
      prisma.storageMirrorJob.count({ where: { orgId } }),
      prisma.storageMirrorJob.count({
        where: { orgId, status: MirrorJobStatus.PENDING },
      }),
      prisma.storageMirrorJob.count({
        where: { orgId, status: MirrorJobStatus.PROCESSING },
      }),
      prisma.storageMirrorJob.count({
        where: { orgId, status: MirrorJobStatus.COMPLETED },
      }),
      prisma.storageMirrorJob.count({
        where: { orgId, status: MirrorJobStatus.FAILED },
      }),
      prisma.storageMirrorJob.findFirst({
        where: { orgId, status: MirrorJobStatus.COMPLETED },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);

  return {
    total,
    pending,
    processing,
    completed,
    failed,
    lastCompletedAt: last?.completedAt ?? null,
    // We don't store sizeBytes on the job row in v1 — this is a placeholder
    // that the Workspace Health tile can light up once we backfill from
    // InspectionPhoto.fileSize. Returning 0 keeps the API shape stable.
    totalBytesMirrored: 0,
  };
}

export async function retryJob(jobId: string): Promise<boolean> {
  const result = await prisma.storageMirrorJob.updateMany({
    where: { id: jobId, status: MirrorJobStatus.FAILED },
    data: {
      status: MirrorJobStatus.PENDING,
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  });
  return result.count > 0;
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await prisma.storageMirrorJob.updateMany({
    where: { id: jobId, status: MirrorJobStatus.PENDING },
    data: {
      status: MirrorJobStatus.FAILED,
      lastError: "Cancelled by user",
    },
  });
  return result.count > 0;
}

/** Remove COMPLETED/FAILED jobs older than 7 days. */
export async function cleanupMirrorQueue(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.storageMirrorJob.deleteMany({
    where: {
      status: { in: [MirrorJobStatus.COMPLETED, MirrorJobStatus.FAILED] },
      createdAt: { lt: sevenDaysAgo },
    },
  });
  if (result.count > 0) {
    console.log(`[Storage Mirror] Cleaned up ${result.count} old jobs`);
  }
  return result.count;
}
