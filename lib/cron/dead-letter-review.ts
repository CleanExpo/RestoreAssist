import { prisma } from '@/lib/prisma'
import { logAgentEvent } from '@/lib/agents'
import type { CronJobResult } from './runner'

const BATCH_SIZE = 20
const MIN_AGE_MS = 30 * 60 * 1000 // 30 minutes
const RETRYABLE_ERROR_CODES = ['TIMEOUT', 'RATE_LIMIT', 'AI_PROVIDER_ERROR']
const MAX_DEAD_LETTER_RETRIES = 2

/**
 * Reviews DEAD_LETTER tasks and re-queues those with transient/retryable errors.
 * Only re-queues tasks that have been in DEAD_LETTER for at least 30 minutes.
 *
 * @returns Result with count of tasks reviewed and count re-queued
 */
export async function reviewDeadLetterTasks(): Promise<CronJobResult> {
  const ageThreshold = new Date(Date.now() - MIN_AGE_MS)

  const deadLetterTasks = await prisma.agentTask.findMany({
    where: {
      status: 'DEAD_LETTER',
      errorCode: { in: RETRYABLE_ERROR_CODES },
      updatedAt: { lt: ageThreshold },
      attempts: { lt: MAX_DEAD_LETTER_RETRIES + 3 }, // original maxRetries + dead letter retries
    },
    include: {
      workflow: { select: { status: true } },
    },
    take: BATCH_SIZE,
    orderBy: { updatedAt: 'asc' },
  })

  let requeued = 0

  for (const task of deadLetterTasks) {
    // Only re-queue if the workflow is still in a recoverable state
    if (['RUNNING', 'PARTIALLY_FAILED', 'FAILED'].includes(task.workflow.status)) {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: 'READY',
          errorMessage: null,
          errorCode: null,
        },
      })

      // Ensure workflow is RUNNING
      if (task.workflow.status !== 'RUNNING') {
        await prisma.agentWorkflow.update({
          where: { id: task.workflowId },
          data: {
            status: 'RUNNING',
            completedAt: null,
            errorMessage: null,
          },
        })
      }

      await logAgentEvent(task.id, 'info', 'Task re-queued from dead letter by cron review')
      requeued++
    }
  }

  return {
    itemsProcessed: deadLetterTasks.length,
    metadata: { reviewed: deadLetterTasks.length, requeued },
  }
}
