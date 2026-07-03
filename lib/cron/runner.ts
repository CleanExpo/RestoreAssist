import { prisma } from "@/lib/prisma";

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
  // Guard against overlapping runs (check if any running within last 5 min)
  const recentRunning = await prisma.cronJobRun.findFirst({
    where: {
      jobName,
      status: "running",
      startedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });

  if (recentRunning) {
    return {
      itemsProcessed: 0,
      status: "skipped",
      metadata: { reason: "Already running" },
    };
  }

  // Create a new job run record
  const run = await prisma.cronJobRun.create({
    data: { jobName, status: "running" },
  });

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
