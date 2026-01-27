/**
 * State Manager — persistence and atomic state transitions for workflows and tasks.
 *
 * All transitions use optimistic concurrency control: the update WHERE clause
 * includes the expected current status, so concurrent mutations are detected
 * and rejected (updateCount === 0).
 */

import { prisma } from '@/lib/prisma'
import type { WorkflowStatus, TaskStatus } from '@prisma/client'
import type { WorkflowContext, TaskOutput } from './types'

// ---------------------------------------------------------------------------
// Task state transitions
// ---------------------------------------------------------------------------

/**
 * Atomically transition a task from one status to another.
 * Returns true if the transition succeeded, false if the task was not in
 * the expected `from` status (optimistic lock failure).
 */
export async function transitionTask(
  taskId: string,
  from: TaskStatus,
  to: TaskStatus,
  data?: Record<string, unknown>
): Promise<boolean> {
  const result = await prisma.agentTask.updateMany({
    where: { id: taskId, status: from },
    data: { status: to, ...data },
  })

  if (result.count > 0) {
    // Update workflow lastActivityAt for stale detection
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: { workflowId: true },
    })
    if (task) {
      await prisma.agentWorkflow.update({
        where: { id: task.workflowId },
        data: { lastActivityAt: new Date() },
      }).catch(() => {}) // Non-blocking
    }
  }

  return result.count > 0
}

/**
 * Atomically transition a workflow status.
 */
export async function transitionWorkflow(
  workflowId: string,
  from: WorkflowStatus,
  to: WorkflowStatus,
  data?: Record<string, unknown>
): Promise<boolean> {
  const result = await prisma.agentWorkflow.updateMany({
    where: { id: workflowId, status: from },
    data: { status: to, ...data },
  })
  return result.count > 0
}

// ---------------------------------------------------------------------------
// Task readiness
// ---------------------------------------------------------------------------

/**
 * Scan all PENDING tasks in a workflow and promote those whose
 * dependencies are fully COMPLETED to READY status.
 * Returns the number of tasks promoted.
 */
export async function markTasksReady(workflowId: string): Promise<number> {
  const tasks = await prisma.agentTask.findMany({
    where: { workflowId },
    select: { id: true, status: true, dependsOnTaskIds: true },
  })

  const completedIds = new Set(
    tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.id)
  )

  const toPromote = tasks.filter(
    (t) =>
      t.status === 'PENDING' &&
      t.dependsOnTaskIds.every((depId) => completedIds.has(depId))
  )

  if (toPromote.length === 0) return 0

  const result = await prisma.agentTask.updateMany({
    where: {
      id: { in: toPromote.map((t) => t.id) },
      status: 'PENDING',
    },
    data: { status: 'READY' },
  })

  return result.count
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

/**
 * Build a WorkflowContext by aggregating outputs from all completed tasks.
 */
export async function buildContext(workflowId: string): Promise<WorkflowContext> {
  const workflow = await prisma.agentWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    select: {
      id: true,
      userId: true,
      reportId: true,
      inspectionId: true,
      config: true,
    },
  })

  const completedTasks = await prisma.agentTask.findMany({
    where: { workflowId, status: 'COMPLETED' },
    select: { agentSlug: true, output: true },
  })

  const completedOutputs: Record<string, TaskOutput> = {}
  for (const task of completedTasks) {
    if (task.output) {
      try {
        completedOutputs[task.agentSlug] = JSON.parse(task.output) as TaskOutput
      } catch {
        // Skip malformed output
      }
    }
  }

  const sharedState = workflow.config ? JSON.parse(workflow.config) : {}

  return {
    workflowId,
    userId: workflow.userId,
    reportId: workflow.reportId ?? undefined,
    inspectionId: workflow.inspectionId ?? undefined,
    completedOutputs,
    sharedState,
  }
}

// ---------------------------------------------------------------------------
// Workflow progress
// ---------------------------------------------------------------------------

/**
 * Recalculate and persist workflow counters (completedTasks, failedTasks)
 * and determine if the workflow has reached a terminal state.
 */
export async function refreshWorkflowProgress(workflowId: string): Promise<{
  status: WorkflowStatus
  totalTasks: number
  completedTasks: number
  failedTasks: number
}> {
  const tasks = await prisma.agentTask.findMany({
    where: { workflowId },
    select: { status: true },
  })

  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length
  const failed = tasks.filter((t) => t.status === 'FAILED' || t.status === 'DEAD_LETTER').length
  const skipped = tasks.filter((t) => t.status === 'SKIPPED').length
  const cancelled = tasks.filter((t) => t.status === 'CANCELLED').length

  const finished = completed + failed + skipped + cancelled

  let newStatus: WorkflowStatus
  if (finished === total && failed === 0) {
    newStatus = 'COMPLETED'
  } else if (finished === total && failed > 0 && completed > 0) {
    newStatus = 'PARTIALLY_FAILED'
  } else if (finished === total && completed === 0) {
    newStatus = 'FAILED'
  } else {
    newStatus = 'RUNNING'
  }

  const updateData: Record<string, unknown> = {
    totalTasks: total,
    completedTasks: completed,
    failedTasks: failed,
  }

  if (newStatus === 'COMPLETED' || newStatus === 'FAILED' || newStatus === 'PARTIALLY_FAILED') {
    updateData.completedAt = new Date()
    updateData.status = newStatus
  }

  await prisma.agentWorkflow.update({
    where: { id: workflowId },
    data: updateData as any,
  })

  return { status: newStatus, totalTasks: total, completedTasks: completed, failedTasks: failed }
}
