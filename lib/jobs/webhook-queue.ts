import {
  processWebhookEvent,
} from "@/lib/integrations/webhook-processor";
import { prisma } from "@/lib/prisma";
import {
  reclaimStaleWebhookEvents,
  WEBHOOK_MAX_RETRIES,
} from "@/lib/jobs/webhook-reclaim";

/**
 * Webhook Queue System
 *
 * Manages background processing of webhook events
 * Uses database polling pattern (no Redis required)
 */

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

/**
 * Whose webhook events to count. There is no default: a signed-in user's
 * page passes their own id, and only a CRON_SECRET-gated route may ask for
 * every tenant (RA-8423 — the metrics endpoint used to show every user the
 * site-wide counts).
 */
export type QueueStatsScope = { userId: string } | { allTenants: true };

/**
 * Get queue statistics for one user's integrations, or for every tenant.
 */
export async function getQueueStats(
  scope: QueueStatsScope,
): Promise<QueueStats> {
  let owner: { integration: { userId: string } } | Record<string, never>;
  if ("userId" in scope) {
    // An undefined userId would make Prisma drop the filter and count
    // every tenant, so refuse it rather than fall through.
    if (typeof scope.userId !== "string" || scope.userId.length === 0) {
      throw new Error("getQueueStats: userId is required");
    }
    owner = { integration: { userId: scope.userId } };
  } else if (scope.allTenants === true) {
    owner = {};
  } else {
    throw new Error("getQueueStats: scope must name a user or all tenants");
  }

  const [pending, processing, completed, failed, total] = await Promise.all([
    prisma.webhookEvent.count({ where: { ...owner, status: "PENDING" } }),
    prisma.webhookEvent.count({ where: { ...owner, status: "PROCESSING" } }),
    prisma.webhookEvent.count({ where: { ...owner, status: "COMPLETED" } }),
    prisma.webhookEvent.count({ where: { ...owner, status: "FAILED" } }),
    prisma.webhookEvent.count({ where: owner }),
  ]);

  return {
    pending,
    processing,
    completed,
    failed,
    total,
  };
}

/**
 * Process webhook queue
 * Polls for pending events and processes them
 */
export async function processWebhookQueue(
  options: {
    batchSize?: number;
    maxConcurrent?: number;
  } = {},
): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const { batchSize = 10, maxConcurrent = 3 } = options;

  console.log(
    `[Webhook Queue] Starting processing (batch: ${batchSize}, concurrent: ${maxConcurrent})`,
  );

  // RA-8426 — the stale-claim rule has one owner, shared with the scheduled
  // drains (sync-xero-payments, sync-qbo-myob-payments).
  await reclaimStaleWebhookEvents();

  // RA-1303 — time-based backoff on retries. Without this, an event that
  // fails once is immediately re-picked on the next cron tick; if the
  // underlying problem persists (auth expired, provider down) all 5
  // retries burn within minutes. Enforce min elapsed since last attempt,
  // scaled by retryCount so successive failures back off exponentially:
  //   retry 0 → 0min    (fresh event)
  //   retry 1 → 2min    (first re-attempt)
  //   retry 2 → 4min
  //   retry 3 → 8min
  //   retry 4 → 16min
  // Uses updatedAt as the proxy for "last touched" — updated on any
  // status transition, so PENDING after a FAILED→PENDING reset carries
  // the reset time.
  const now = Date.now();
  const pendingCandidates = await prisma.webhookEvent.findMany({
    where: {
      status: "PENDING",
      retryCount: { lt: WEBHOOK_MAX_RETRIES },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize * 2, // over-fetch so we still have work after time filter
  });
  const pendingEvents = pendingCandidates
    .filter((e) => {
      const backoffMs =
        e.retryCount === 0
          ? 0
          : Math.min(
              60 * 60 * 1000, // cap at 1h
              Math.pow(2, e.retryCount) * 60_000, // 2min × 2^retryCount
            );
      return now - e.updatedAt.getTime() >= backoffMs;
    })
    .slice(0, batchSize);

  if (pendingEvents.length === 0) {
    console.log("[Webhook Queue] No pending events to process");
    return { processed: 0, failed: 0, errors: [] };
  }

  console.log(`[Webhook Queue] Found ${pendingEvents.length} pending events`);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process events in chunks to respect maxConcurrent limit
  for (let i = 0; i < pendingEvents.length; i += maxConcurrent) {
    const chunk = pendingEvents.slice(i, i + maxConcurrent);

    const results = await Promise.allSettled(
      chunk.map((event) => processWebhookEvent(event.id)),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        failed++;
        const error = `Event ${chunk[index].id}: ${result.reason}`;
        errors.push(error);
        console.error(`[Webhook Queue] ${error}`);
      }
    });
  }

  console.log(
    `[Webhook Queue] Completed: ${processed} processed, ${failed} failed`,
  );

  return { processed, failed, errors };
}

/**
 * Retry failed webhook events
 * Resets status to PENDING for manual retry
 *
 * RA-6974: processXeroWebhookBatch marks FAILED on first error and never
 * retries (regressed from the old generic path's 5x-with-backoff). This
 * function has a caller now (the retry-failed-webhooks cron), so a
 * `maxRetries` bound is required — otherwise a permanently-broken event
 * would be reset to PENDING forever. `retryCount` is incremented atomically
 * on every reset so the bound is enforced across repeated cron runs.
 */
export async function retryFailedEvents(
  options: {
    eventIds?: string[];
    olderThan?: Date;
    limit?: number;
    maxRetries?: number;
  } = {},
): Promise<number> {
  // RA-8481 — the same bound the reclaim and the drains use, so a row the
  // reclaim marked FAILED at the limit is never put back to PENDING here.
  const {
    eventIds,
    olderThan,
    limit: _limit = 100,
    maxRetries = WEBHOOK_MAX_RETRIES,
  } = options;

  const where: any = {
    status: "FAILED",
    retryCount: { lt: maxRetries },
  };

  if (eventIds && eventIds.length > 0) {
    where.id = { in: eventIds };
  }

  if (olderThan) {
    where.createdAt = { lt: olderThan };
  }

  // Reset status to PENDING and atomically increment retry count
  const result = await prisma.webhookEvent.updateMany({
    where,
    data: {
      status: "PENDING",
      errorMessage: null,
      retryCount: { increment: 1 },
    },
  });

  console.log(`[Webhook Queue] Reset ${result.count} failed events to PENDING`);

  return result.count;
}

/**
 * Clean up old webhook events
 * Removes events older than specified days
 */
export async function cleanupOldEvents(
  options: {
    olderThanDays?: number;
    keepFailed?: boolean;
  } = {},
): Promise<number> {
  const { olderThanDays = 30, keepFailed = true } = options;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const where: any = {
    createdAt: { lt: cutoffDate },
    status: { in: ["COMPLETED", "SKIPPED"] },
  };

  if (!keepFailed) {
    where.status.in.push("FAILED");
  }

  const result = await prisma.webhookEvent.deleteMany({
    where,
  });

  console.log(`[Webhook Queue] Deleted ${result.count} old events`);

  return result.count;
}

/**
 * Get events by status
 */
export async function getEventsByStatus(
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED",
  options: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<any[]> {
  const { limit = 50, offset = 0 } = options;

  const events = await prisma.webhookEvent.findMany({
    where: { status },
    include: {
      integration: {
        select: {
          id: true,
          provider: true,
          name: true,
          userId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return events;
}

/**
 * Get event details by ID
 */
export async function getEventDetails(eventId: string): Promise<any> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
    include: {
      integration: {
        select: {
          id: true,
          provider: true,
          name: true,
          userId: true,
          status: true,
        },
      },
    },
  });

  return event;
}

/**
 * Background worker loop
 * Continuously processes webhook queue
 * NOT RECOMMENDED: Use external cron job instead
 */
let workerRunning = false;
let workerIntervalId: NodeJS.Timeout | null = null;

export function startWorker(intervalMs: number = 30000): void {
  if (workerRunning) {
    console.warn("[Webhook Queue] Worker already running");
    return;
  }

  console.log(
    `[Webhook Queue] Starting background worker (interval: ${intervalMs}ms)`,
  );

  workerRunning = true;

  workerIntervalId = setInterval(async () => {
    try {
      await processWebhookQueue({ batchSize: 10, maxConcurrent: 3 });
    } catch (error) {
      console.error("[Webhook Queue] Worker error:", error);
    }
  }, intervalMs);
}

export function stopWorker(): void {
  if (!workerRunning) {
    console.warn("[Webhook Queue] Worker not running");
    return;
  }

  console.log("[Webhook Queue] Stopping background worker");

  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }

  workerRunning = false;
}
