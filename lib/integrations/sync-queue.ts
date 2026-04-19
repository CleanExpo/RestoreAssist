import { prisma } from "@/lib/prisma";
import { Integration, IntegrationProvider } from "@prisma/client";
import { withRateLimit } from "./rate-limiter";
import { withCircuitBreaker, DEFAULT_CIRCUIT_OPTIONS } from "./circuit-breaker";
import { retryWithExponentialBackoff, DEFAULT_RETRY_OPTIONS } from "./retry";
// RA-902: real provider dispatch — replaces simulation stub
import { syncInvoiceToXero } from "./xero";
import { syncInvoiceToQuickBooks } from "./quickbooks";
import { syncInvoiceToMYOB } from "./myob";

/**
 * Durable Sync Queue System — RA-902
 *
 * Replaces the previous in-memory array with a Prisma-backed `InvoiceSyncJob`
 * table so jobs survive Vercel cold starts and serverless scale-out.
 *
 * The priority / rate-limit / circuit-breaker / retry logic is unchanged.
 */

// ─── Types (kept for external callers) ───────────────────────────────────────

export interface SyncJob {
  id: string;
  invoiceId: string;
  provider: IntegrationProvider;
  priority: "HIGH" | "NORMAL" | "LOW";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  retryCount: number;
  errorMessage?: string;
  createdAt: Date;
}

// ─── Queue writes ─────────────────────────────────────────────────────────────

/**
 * Add invoice to the durable sync queue.
 * Upserts so duplicate enqueue calls for the same (invoiceId, provider) are safe.
 * Returns the job ID.
 */
export async function queueInvoiceSync(
  invoiceId: string,
  provider: IntegrationProvider,
  priority: "HIGH" | "NORMAL" | "LOW" = "NORMAL",
): Promise<string> {
  // Priority upgrade: if a PENDING job already exists with lower priority, bump it.
  const priorityOrder: Record<string, number> = { HIGH: 2, NORMAL: 1, LOW: 0 };

  const existing = await prisma.invoiceSyncJob.findUnique({
    where: { invoiceId_provider: { invoiceId, provider: provider as string } },
  });

  if (existing) {
    if (
      existing.status === "PENDING" &&
      priorityOrder[priority] > priorityOrder[existing.priority]
    ) {
      await prisma.invoiceSyncJob.update({
        where: { id: existing.id },
        data: { priority },
      });
      console.log(
        `[Sync Queue] Upgraded priority for invoice ${invoiceId} to ${priority}`,
      );
    }
    return existing.id;
  }

  const job = await prisma.invoiceSyncJob.create({
    data: {
      invoiceId,
      provider: provider as string,
      priority,
      status: "PENDING",
    },
  });

  console.log(
    `[Sync Queue] Queued invoice ${invoiceId} for ${provider} sync (priority: ${priority})`,
  );

  return job.id;
}

// ─── Queue processing ─────────────────────────────────────────────────────────

/**
 * Fetch and process the next batch of PENDING jobs (priority-ordered).
 * Called by the sync-invoices cron route.
 */
export async function processNextBatch(
  options: {
    maxJobs?: number;
  } = {},
): Promise<{ processed: number; failed: number; remaining: number }> {
  const { maxJobs = 20 } = options;

  // Fetch PENDING jobs ordered by priority (HIGH first) then age (oldest first)
  const jobs = await prisma.invoiceSyncJob.findMany({
    where: { status: "PENDING" },
    orderBy: [
      // Prisma sorts strings lexicographically; we store HIGH/NORMAL/LOW
      // so we sort descending — H > N > L
      { priority: "desc" },
      { createdAt: "asc" },
    ],
    take: maxJobs,
  });

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      // Mark as PROCESSING (optimistic lock — prevents duplicate processing)
      const locked = await prisma.invoiceSyncJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "PROCESSING" },
      });

      if (locked.count === 0) {
        // Another process grabbed it — skip
        continue;
      }

      await _processJob(job);
      processed++;
    } catch {
      failed++;
    }
  }

  const remaining = await prisma.invoiceSyncJob.count({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
  });

  console.log(
    `[Sync Queue] Completed: ${processed} processed, ${failed} failed, ${remaining} remaining`,
  );

  return { processed, failed, remaining };
}

async function _processJob(
  job: Awaited<ReturnType<typeof prisma.invoiceSyncJob.findMany>>[0],
): Promise<void> {
  const provider = job.provider as IntegrationProvider;
  const serviceName = `${provider}-sync`;

  try {
    console.log(
      `[Sync Queue] Processing job ${job.id}: invoice ${job.invoiceId} → ${provider}`,
    );

    const invoice = await prisma.invoice.findUnique({
      where: { id: job.invoiceId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${job.invoiceId} not found`);
    }

    await withRateLimit(provider, async () => {
      await withCircuitBreaker(
        serviceName,
        async () => {
          await retryWithExponentialBackoff(async () => {
            await _syncInvoiceToProvider(invoice, provider);
          }, DEFAULT_RETRY_OPTIONS);
        },
        DEFAULT_CIRCUIT_OPTIONS,
      );
    });

    // Mark completed
    await prisma.invoiceSyncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    // Audit trail
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: invoice.id,
        userId: invoice.userId,
        action: "sync_queued",
        description: `Invoice synced to ${provider} via durable queue`,
        metadata: { jobId: job.id, priority: job.priority },
      },
    });

    console.log(`[Sync Queue] Completed job ${job.id}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Sync Queue] Job ${job.id} failed:`, error);

    const newRetryCount = job.retryCount + 1;
    const maxRetries = 3;

    await prisma.invoiceSyncJob.update({
      where: { id: job.id },
      data: {
        status: newRetryCount >= maxRetries ? "FAILED" : "PENDING",
        retryCount: newRetryCount,
        errorMessage: message,
      },
    });

    if (newRetryCount >= maxRetries) {
      // RA-1297 — dead-letter alerting. Without this, permanent sync
      // failures silently rot in the DB until a customer notices missing
      // invoices at BAS time. Emit a recognisable '[DEAD-LETTER]' prefix
      // for log-drain-based monitoring, AND drop a user-facing Notification
      // row so it surfaces in the dashboard's in-app notification panel.
      console.error(
        `[DEAD-LETTER] [Sync Queue] Job ${job.id} permanently failed after ${newRetryCount} attempts — provider=${job.provider} invoice=${job.invoiceId} error=${message}`,
      );
      // Best-effort notification — don't let alerting failure mask the
      // original job failure we're re-throwing below.
      try {
        const invoice = await prisma.invoice.findUnique({
          where: { id: job.invoiceId },
          select: { userId: true, invoiceNumber: true },
        });
        if (invoice?.userId) {
          await prisma.notification.create({
            data: {
              userId: invoice.userId,
              type: "ERROR",
              title: `${job.provider} sync failed`,
              message: `Invoice ${invoice.invoiceNumber ?? job.invoiceId} could not be synced to ${job.provider} after ${newRetryCount} attempts. Last error: ${message.slice(0, 200)}. Check the integration status and retry from Settings → Integrations.`,
              link: `/dashboard/invoices?highlight=${job.invoiceId}`,
            },
          });
        }
      } catch (notifyErr) {
        console.error(
          `[DEAD-LETTER] [Sync Queue] Failed to create user notification for job ${job.id}:`,
          notifyErr,
        );
      }
    } else {
      console.log(
        `[Sync Queue] Job ${job.id} will retry (attempt ${newRetryCount}/${maxRetries})`,
      );
    }

    throw error; // re-throw so processNextBatch increments failed counter
  }
}

// ─── Status / management helpers ──────────────────────────────────────────────

/** Get queue statistics (reads from DB). */
export async function getSyncQueueStats(): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const [total, pending, processing, completed, failed] = await Promise.all([
    prisma.invoiceSyncJob.count(),
    prisma.invoiceSyncJob.count({ where: { status: "PENDING" } }),
    prisma.invoiceSyncJob.count({ where: { status: "PROCESSING" } }),
    prisma.invoiceSyncJob.count({ where: { status: "COMPLETED" } }),
    prisma.invoiceSyncJob.count({ where: { status: "FAILED" } }),
  ]);

  return { total, pending, processing, completed, failed };
}

/** Cancel a PENDING job. Returns true if cancelled, false if not found/not pending. */
export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await prisma.invoiceSyncJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "FAILED", errorMessage: "Cancelled by user" },
  });
  return result.count > 0;
}

/** Retry a FAILED job by resetting it to PENDING. */
export async function retryJob(jobId: string): Promise<boolean> {
  const result = await prisma.invoiceSyncJob.updateMany({
    where: { id: jobId, status: "FAILED" },
    data: { status: "PENDING", retryCount: 0, errorMessage: null },
  });
  return result.count > 0;
}

/** Get a single job's current status. */
export async function getJobStatus(jobId: string): Promise<SyncJob | null> {
  const job = await prisma.invoiceSyncJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  return {
    id: job.id,
    invoiceId: job.invoiceId,
    provider: job.provider as IntegrationProvider,
    priority: job.priority as "HIGH" | "NORMAL" | "LOW",
    status: job.status as "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
    retryCount: job.retryCount,
    errorMessage: job.errorMessage ?? undefined,
    createdAt: job.createdAt,
  };
}

/** Remove COMPLETED/FAILED jobs older than 24 hours. Returns count deleted. */
export async function cleanupSyncQueue(): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.invoiceSyncJob.deleteMany({
    where: {
      status: { in: ["COMPLETED", "FAILED"] },
      createdAt: { lt: oneDayAgo },
    },
  });

  if (result.count > 0) {
    console.log(`[Sync Queue] Cleaned up ${result.count} old jobs`);
  }

  return result.count;
}

// ─── Internal sync dispatch ───────────────────────────────────────────────────

/**
 * RA-902: Dispatch an invoice to the correct provider integration.
 *
 * Looks up the active Integration row for this invoice's workspace/user,
 * then calls the appropriate provider client. Errors propagate to the
 * caller (_processJob) which handles retry/dead-letter via the queue.
 */
async function _syncInvoiceToProvider(
  invoice: { id: string; userId: string; workspaceId?: string | null },
  provider: IntegrationProvider,
): Promise<void> {
  // Find the active integration for this provider + workspace/user
  const integration = await prisma.integration.findFirst({
    where: {
      provider,
      userId: invoice.userId,
      ...(invoice.workspaceId ? { workspaceId: invoice.workspaceId } : {}),
      status: "CONNECTED",
    },
  });

  if (!integration) {
    throw new Error(
      `No active ${provider} integration found for invoice ${invoice.id} (userId: ${invoice.userId})`,
    );
  }

  switch (provider) {
    case IntegrationProvider.XERO:
      await syncInvoiceToXero(invoice, integration as Integration);
      break;
    case IntegrationProvider.QUICKBOOKS:
      await syncInvoiceToQuickBooks(invoice, integration as Integration);
      break;
    case IntegrationProvider.MYOB:
      await syncInvoiceToMYOB(invoice, integration as Integration);
      break;
    default:
      throw new Error(
        `Provider ${provider} does not support invoice sync via the durable queue`,
      );
  }
}
