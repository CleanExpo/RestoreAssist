/**
 * Agent Orchestrator — workflow lifecycle management.
 *
 * Creates workflows from definitions, manages task readiness,
 * and coordinates the execution flow.
 */

import { prisma } from '@/lib/prisma'
import type { AgentTask, AgentWorkflow } from '@prisma/client'
import type { WorkflowDefinition, WorkflowContext } from './types'
import { decompose } from './task-decomposer'
import { buildContext, markTasksReady, refreshWorkflowProgress, transitionWorkflow } from './state-manager'
import { syncToDatabase } from './registry'

// ---------------------------------------------------------------------------
// Workflow creation
// ---------------------------------------------------------------------------

/**
 * Create a new workflow from a definition template.
 * Creates the workflow record and all task records in a single transaction.
 */
export async function createWorkflow(
  definition: WorkflowDefinition,
  params: {
    userId: string
    reportId?: string
    inspectionId?: string
    config?: Record<string, unknown>
    scheduledFor?: Date
  }
): Promise<{ workflowId: string; taskCount: number }> {
  // Ensure agents are synced to the database
  await syncToDatabase()

  const { tasks, taskGraph } = decompose(definition, params)

  const workflow = await prisma.$transaction(async (tx) => {
    const wf = await tx.agentWorkflow.create({
      data: {
        name: definition.name,
        description: definition.description,
        userId: params.userId,
        reportId: params.reportId ?? null,
        inspectionId: params.inspectionId ?? null,
        taskGraph: JSON.stringify(taskGraph),
        status: 'PENDING',
        totalTasks: tasks.length,
        config: params.config ? JSON.stringify(params.config) : null,
        scheduledFor: params.scheduledFor ?? null,
      },
    })

    // Create all tasks — tasks with no dependencies start as READY
    for (const task of tasks) {
      await tx.agentTask.create({
        data: {
          workflowId: wf.id,
          agentSlug: task.agentSlug,
          taskType: task.taskType,
          displayName: task.displayName,
          sequenceOrder: task.sequenceOrder,
          parallelGroup: task.parallelGroup,
          dependsOnTaskIds: task.dependsOnTaskIds,
          input: task.input,
          status: task.dependsOnTaskIds.length === 0 ? 'READY' : 'PENDING',
          idempotencyKey: `${wf.id}:${task.agentSlug}:${task.taskType}`,
        },
      })
    }

    return wf
  })

  return { workflowId: workflow.id, taskCount: tasks.length }
}

// ---------------------------------------------------------------------------
// Execution coordination
// ---------------------------------------------------------------------------

/**
 * Get all tasks that are ready to execute (status = READY).
 */
export async function getExecutableTasks(workflowId: string): Promise<AgentTask[]> {
  return prisma.agentTask.findMany({
    where: { workflowId, status: 'READY' },
    orderBy: [{ parallelGroup: 'asc' }, { sequenceOrder: 'asc' }],
  })
}

/**
 * After one or more tasks complete, promote dependent tasks and refresh progress.
 * Returns the updated workflow status.
 */
export async function advanceWorkflow(workflowId: string): Promise<{
  status: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  nextExecutable: AgentTask[]
}> {
  // Promote newly-ready tasks
  await markTasksReady(workflowId)

  // Refresh counters and determine terminal state
  const progress = await refreshWorkflowProgress(workflowId)

  // If workflow just completed/failed, update timestamps
  if (progress.status === 'COMPLETED' || progress.status === 'FAILED' || progress.status === 'PARTIALLY_FAILED') {
    // Already handled in refreshWorkflowProgress
  } else if (progress.status === 'RUNNING') {
    // Ensure workflow is in RUNNING state
    await transitionWorkflow(workflowId, 'PENDING', 'RUNNING', { startedAt: new Date() })
  }

  const nextExecutable = await getExecutableTasks(workflowId)

  return {
    status: progress.status,
    totalTasks: progress.totalTasks,
    completedTasks: progress.completedTasks,
    failedTasks: progress.failedTasks,
    nextExecutable,
  }
}

// ---------------------------------------------------------------------------
// Workflow status
// ---------------------------------------------------------------------------

/**
 * Get full workflow status including all tasks.
 */
export async function getWorkflowStatus(workflowId: string): Promise<
  AgentWorkflow & { tasks: AgentTask[] }
> {
  return prisma.agentWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      tasks: {
        orderBy: [{ parallelGroup: 'asc' }, { sequenceOrder: 'asc' }],
      },
    },
  })
}

/**
 * Build the execution context for a workflow.
 */
export async function getWorkflowContext(workflowId: string): Promise<WorkflowContext> {
  return buildContext(workflowId)
}

// ---------------------------------------------------------------------------
// Workflow lifecycle
// ---------------------------------------------------------------------------

/**
 * Cancel a running workflow. All non-completed tasks are set to CANCELLED.
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.agentTask.updateMany({
      where: {
        workflowId,
        status: { in: ['PENDING', 'READY'] },
      },
      data: { status: 'CANCELLED' },
    })

    await tx.agentWorkflow.update({
      where: { id: workflowId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    })
  })
}

/**
 * Resume a failed or partially-failed workflow by re-queuing failed tasks.
 */
export async function resumeWorkflow(workflowId: string): Promise<{ retriedCount: number }> {
  const result = await prisma.agentTask.updateMany({
    where: {
      workflowId,
      status: { in: ['FAILED', 'DEAD_LETTER'] },
    },
    data: {
      status: 'READY',
      errorMessage: null,
      errorCode: null,
      attempts: 0,
    },
  })

  // Reset workflow status to RUNNING
  await prisma.agentWorkflow.update({
    where: { id: workflowId },
    data: {
      status: 'RUNNING',
      completedAt: null,
      errorMessage: null,
      failedTasks: 0,
    },
  })

  return { retriedCount: result.count }
}
