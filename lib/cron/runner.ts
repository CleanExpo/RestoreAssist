import { prisma } from "@/lib/prisma";
import { PG_POOL_CONNECTION_TIMEOUT_MS } from "@/lib/prisma-pool-config";

/**
 * Options for the RA-7774 claim transaction. Prisma's interactive defaults
 * (maxWait 2s, timeout 5s) would make the claim stricter than the plain
 * queries it replaced, so a busy pool would fail a cron that used to run:
 * - maxWait matches the pool's own connection wait (lib/prisma.ts), so getting
 *   a connection is bounded exactly as it was before the transaction existed.
 * - timeout covers the claim's work, which is milliseconds, plus waiting on the
 *   advisory lock behind another invocation's claim of the same job, which is
 *   also milliseconds per claim. 20s leaves a wide margin for a slow database
 *   without letting a stuck claim hold a pooled connection indefinitely.
 */
export const CRON_CLAIM_TRANSACTION_OPTIONS = {
  maxWait: PG_POOL_CONNECTION_TIMEOUT_MS,
  timeout: 20_000,
} as const;

export interface CronJobResult {
  itemsProcessed: number;
  metadata?: Record<string, unknown>;
}

/**
 * Wrapper for cron job execution that provides:
 * - Overlap protection (prevents duplicate runs)
 * - Audit logging to CronJobRun table
 * - Error handling and reporting
 * - Duration tracking
 *
 * @param jobName - Unique identifier for this cron job
 * @param handler - The actual job function to execute
 * @returns Result with status and metrics
 */
export async function runCronJob(
  jobName: string,
  handler: () => Promise<CronJobResult>,
): Promise<CronJobResult & { status: string }> {
  // Guard against overlapping runs (check if any running within last 5 min).
  // RA-7774: the check and the create run in one short transaction under a
  // per-job advisory lock, so two invocations that start together cannot both
  // see "nothing running" and both claim. The lock is released at commit; the
  // handler runs outside the transaction.
  const run = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cron:' || ${jobName}))`;

    const recentRunning = await tx.cronJobRun.findFirst({
      where: {
        jobName,
        status: "running",
        startedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });

    if (recentRunning) return null;

    // Create a new job run record
    return tx.cronJobRun.create({
      data: { jobName, status: "running" },
    });
  }, CRON_CLAIM_TRANSACTION_OPTIONS);

  if (!run) {
    return {
      itemsProcessed: 0,
      status: "skipped",
      metadata: { reason: "Already running" },
    };
  }

  const startTime = Date.now();

  try {
    const result = await handler();
    const durationMs = Date.now() - startTime;

    await prisma.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        itemsProcessed: result.itemsProcessed,
        durationMs,
        metadata: result.metadata ? JSON.stringify(result.metadata) : null,
      },
    });

    return { ...result, status: "completed" };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const internalMessage = err instanceof Error ? err.message : String(err);

    // Internal audit trail keeps the real error — never exposed past this
    // function (RA-6968: the previous `metadata: { error: String(err) }`
    // return value echoed the raw error straight into the JSON response
    // every one of the 12 cron routes serializes verbatim).
    console.error(`[cron:${jobName}] job failed:`, err);
    await prisma.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs,
        errorMessage: internalMessage,
      },
    });

    // RA-6968: previously this returned `{ status: "failed" }` and every
    // caller did `NextResponse.json(result)` — always HTTP 200, so a failed
    // cron job was invisible to Vercel Cron / uptime monitoring. Throwing a
    // sanitised error (no `internalMessage`) forces a non-2xx response for
    // every caller: routes that wrap runCronJob in try/catch already return
    // a generic 500 on catch, and routes that don't get Next.js's default
    // 500 for an unhandled Route Handler exception — either way the failure
    // is now visible, without leaking the raw error string.
    throw new Error(`Cron job "${jobName}" failed`);
  }
}
