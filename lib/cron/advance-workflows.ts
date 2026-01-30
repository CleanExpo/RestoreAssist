import { prisma } from '@/lib/prisma'
import {
  advanceWorkflow,
  getExecutableTasks,
  getWorkflowContext,
  executeBatch,
} from '@/lib/agents'
import type { CronJobResult } from './runner'

const BATCH_SIZE = 10
const STALE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Performs three workflow management tasks:
 * 1. Activates scheduled workflows whose scheduledFor time has arrived
 * 2. Advances RUNNING workflows that have READY tasks waiting
 * 3. Detects and fails stale workflows (no progress for 15+ minutes)
 *
 * @returns Result with count of workflows processed and breakdown by action type
 */
export async function advanceWorkflows(): Promise<CronJobResult> {
  let processed = 0
  const details: any[] = []

  // 1. Activate scheduled workflows
  const scheduledWorkflows = await prisma.agentWorkflow.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: new Date() },
    },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: 'asc' },
  })

  for (const wf of scheduledWorkflows) {
    try {
      await prisma.agentWorkflow.update({
        where: { id: wf.id },
        data: { status: 'RUNNING', startedAt: new Date(), lastActivityAt: new Date() },
      })

      const readyTasks = await getExecutableTasks(wf.id)
      if (readyTasks.length > 0) {
        const context = await getWorkflowContext(wf.id)
        await executeBatch(readyTasks, context)
        await advanceWorkflow(wf.id)
      }

      processed++
      details.push({ workflowId: wf.id, action: 'scheduled-start' })
    } catch (err) {
      console.error(`[CronAdvance] Failed to start scheduled workflow ${wf.id}:`, err)
    }
  }

  // 2. Advance RUNNING workflows with READY tasks
  const activeWorkflows = await prisma.agentWorkflow.findMany({
    where: {
      status: 'RUNNING',
      tasks: { some: { status: 'READY' } },
    },
    take: BATCH_SIZE - processed,
    orderBy: { updatedAt: 'asc' },
  })

  for (const wf of activeWorkflows) {
    try {
      const readyTasks = await getExecutableTasks(wf.id)
      if (readyTasks.length > 0) {
        const context = await getWorkflowContext(wf.id)
        await executeBatch(readyTasks, context)
        await advanceWorkflow(wf.id)

        await prisma.agentWorkflow.update({
          where: { id: wf.id },
          data: { lastActivityAt: new Date() },
        })
      }

      processed++
      details.push({ workflowId: wf.id, action: 'advanced', tasks: readyTasks.length })
    } catch (err) {
      console.error(`[CronAdvance] Failed to advance workflow ${wf.id}:`, err)
    }
  }

  // 3. Detect and fail stale workflows
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS)
  const staleWorkflows = await prisma.agentWorkflow.findMany({
    where: {
      status: 'RUNNING',
      lastActivityAt: { lt: staleThreshold },
      tasks: { none: { status: { in: ['READY', 'RUNNING'] } } },
    },
    take: 5,
  })

  for (const wf of staleWorkflows) {
    try {
      const progress = await advanceWorkflow(wf.id)

      if (progress.status === 'RUNNING' && progress.nextExecutable.length === 0) {
        // Truly stuck — fail the workflow
        await prisma.agentWorkflow.update({
          where: { id: wf.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: 'Workflow stalled: no executable tasks and no progress for 15+ minutes',
          },
        })
        details.push({ workflowId: wf.id, action: 'stale-failed' })
      } else {
        details.push({ workflowId: wf.id, action: 'stale-resolved', newStatus: progress.status })
      }

      processed++
    } catch (err) {
      console.error(`[CronAdvance] Failed to handle stale workflow ${wf.id}:`, err)
    }
  }

  return { itemsProcessed: processed, metadata: { details } }
}
