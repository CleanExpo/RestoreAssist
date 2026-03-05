import { prisma } from '@/lib/prisma'

export interface CronJobResult {
  itemsProcessed: number
  metadata?: Record<string, unknown>
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
  handler: () => Promise<CronJobResult>
): Promise<CronJobResult & { status: string }> {
  // Guard against overlapping runs (check if any running within last 5 min)
  const recentRunning = await prisma.cronJobRun.findFirst({
    where: {
      jobName,
      status: 'running',
      startedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  })

  if (recentRunning) {
    return { itemsProcessed: 0, status: 'skipped', metadata: { reason: 'Already running' } }
  }

  // Create a new job run record
  const run = await prisma.cronJobRun.create({
    data: { jobName, status: 'running' },
  })

  const startTime = Date.now()

  try {
    const result = await handler()
    const durationMs = Date.now() - startTime

    await prisma.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        itemsProcessed: result.itemsProcessed,
        durationMs,
        metadata: result.metadata ? JSON.stringify(result.metadata) : null,
      },
    })

    return { ...result, status: 'completed' }
  } catch (err) {
    const durationMs = Date.now() - startTime

    await prisma.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    })

    return { itemsProcessed: 0, status: 'failed', metadata: { error: String(err) } }
  }
}
