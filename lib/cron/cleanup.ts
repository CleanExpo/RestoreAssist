import { prisma } from '@/lib/prisma'
import type { CronJobResult } from './runner'

/**
 * Cleans up old data from various tables to prevent unbounded growth:
 * - AgentTaskLog entries older than 30 days
 * - CronJobRun records older than 14 days
 * - Completed/failed/cancelled workflows older than 90 days
 * - Expired PasswordResetTokens (24 hours past expiry)
 * - Sent/failed ScheduledEmail records older than 30 days
 * - SecurityEvent records older than 90 days
 *
 * @returns Result with total items cleaned and breakdown by table
 */
export async function cleanupOldData(): Promise<CronJobResult> {
  const now = Date.now()
  let totalCleaned = 0
  const details: Record<string, number> = {}

  // 1. AgentTaskLog > 30 days
  const logCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000)
  const deletedLogs = await prisma.agentTaskLog.deleteMany({
    where: { timestamp: { lt: logCutoff } },
  })
  totalCleaned += deletedLogs.count
  details.agentTaskLogs = deletedLogs.count

  // 2. CronJobRun > 14 days
  const cronCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000)
  const deletedCronRuns = await prisma.cronJobRun.deleteMany({
    where: { startedAt: { lt: cronCutoff } },
  })
  totalCleaned += deletedCronRuns.count
  details.cronJobRuns = deletedCronRuns.count

  // 3. Completed workflows > 90 days
  const workflowCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000)
  const deletedWorkflows = await prisma.agentWorkflow.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED', 'PARTIALLY_FAILED', 'CANCELLED'] },
      completedAt: { lt: workflowCutoff },
    },
  })
  totalCleaned += deletedWorkflows.count
  details.workflows = deletedWorkflows.count

  // 4. Expired password reset tokens
  const tokenCutoff = new Date(now - 24 * 60 * 60 * 1000)
  const deletedTokens = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: tokenCutoff } },
  })
  totalCleaned += deletedTokens.count
  details.passwordResetTokens = deletedTokens.count

  // 5. Old scheduled emails
  const emailCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000)
  const deletedEmails = await prisma.scheduledEmail.deleteMany({
    where: {
      status: { in: ['sent', 'failed', 'cancelled'] },
      updatedAt: { lt: emailCutoff },
    },
  })
  totalCleaned += deletedEmails.count
  details.scheduledEmails = deletedEmails.count

  // 6. Old security events
  const secCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000)
  const deletedSecEvents = await prisma.securityEvent.deleteMany({
    where: { createdAt: { lt: secCutoff } },
  })
  totalCleaned += deletedSecEvents.count
  details.securityEvents = deletedSecEvents.count

  return { itemsProcessed: totalCleaned, metadata: details }
}
