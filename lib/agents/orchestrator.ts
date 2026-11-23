/**
 * Agent Orchestrator — workflow lifecycle management.
 *
 * Creates workflows from definitions, manages task readiness,
 * and coordinates the execution flow.
 */

import { prisma } from "@/lib/prisma";
import type { AgentTask, AgentWorkflow } from "@prisma/client";
import type { WorkflowDefinition, WorkflowContext } from "./types";
import { decompose } from "./task-decomposer";
import {
  buildContext,
  markTasksReady,
  refreshWorkflowProgress,
  transitionWorkflow,
} from "./state-manager";
import { syncToDatabase } from "./registry";
import { unskipUpstreamFailed } from "./lease";
import { ApprovalPendingError, WorkflowStateChangedError } from "./approval";
import { withWorkflowLock } from "./workflow-lock";
import { randomUUID } from "node:crypto";

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
    userId: string;
    reportId?: string;
    inspectionId?: string;
    config?: Record<string, unknown>;
    scheduledFor?: Date;
  },
): Promise<{ workflowId: string; taskCount: number }> {
  // Ensure agents are synced to the database
  await syncToDatabase();

  const { tasks, taskGraph } = decompose(definition, params);

  // Dependencies are stored as real task ids. The decomposer names tasks by
  // step ("task_<step>"), which are not row ids, so each task gets its id here
  // and dependsOnTaskIds is rewritten to match; otherwise markTasksReady could
  // never see a dependency complete.
  const rowIds = new Map(tasks.map((t) => [t.id, randomUUID()]));
  // RA-8000: a flagged root task starts AWAITING_APPROVAL in a PAUSED workflow.
  const hasGatedRoot = tasks.some(
    (t) => t.dependsOnTaskIds.length === 0 && t.requiresApproval,
  );

  const workflow = await prisma.$transaction(async (tx) => {
    const wf = await tx.agentWorkflow.create({
      data: {
        name: definition.name,
        description: definition.description,
        userId: params.userId,
        reportId: params.reportId ?? null,
        inspectionId: params.inspectionId ?? null,
        taskGraph: JSON.stringify(taskGraph),
        status: hasGatedRoot ? "PAUSED" : "PENDING",
        totalTasks: tasks.length,
        config: params.config ? JSON.stringify(params.config) : null,
        scheduledFor: params.scheduledFor ?? null,
      },
    });

    // Create all tasks — tasks with no dependencies start as READY
    for (const task of tasks) {
      const isRoot = task.dependsOnTaskIds.length === 0;
      const waitsForApproval = isRoot && task.requiresApproval;
      await tx.agentTask.create({
        data: {
          id: rowIds.get(task.id)!,
          workflowId: wf.id,
          agentSlug: task.agentSlug,
          taskType: task.taskType,
          displayName: task.displayName,
          sequenceOrder: task.sequenceOrder,
          parallelGroup: task.parallelGroup,
          dependsOnTaskIds: task.dependsOnTaskIds.map(
            (depId) => rowIds.get(depId) ?? depId,
          ),
          input: task.input,
          requiresApproval: task.requiresApproval,
          approvalRequestedAt: waitsForApproval ? new Date() : null,
          status: waitsForApproval
            ? "AWAITING_APPROVAL"
            : isRoot
              ? "READY"
              : "PENDING",
          idempotencyKey: `${wf.id}:${task.agentSlug}:${task.taskType}`,
        },
      });
    }

    return wf;
  });

  return { workflowId: workflow.id, taskCount: tasks.length };
}

// ---------------------------------------------------------------------------
// Execution coordination
// ---------------------------------------------------------------------------

/**
 * Get all tasks that are ready to execute (status = READY).
 */
export async function getExecutableTasks(
  workflowId: string,
): Promise<AgentTask[]> {
  return prisma.agentTask.findMany({
    where: { workflowId, status: "READY" },
    orderBy: [{ parallelGroup: "asc" }, { sequenceOrder: "asc" }],
  });
}

/**
 * After one or more tasks complete, promote dependent tasks and refresh progress.
 * Returns the updated workflow status.
 */
export async function advanceWorkflow(workflowId: string): Promise<{
  status: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  nextExecutable: AgentTask[];
}> {
  // Promote newly-ready tasks
  await markTasksReady(workflowId);

  // Refresh counters and determine terminal state
  const progress = await refreshWorkflowProgress(workflowId);

  // If workflow just completed/failed, update timestamps
  if (
    progress.status === "COMPLETED" ||
    progress.status === "FAILED" ||
    progress.status === "PARTIALLY_FAILED"
  ) {
    // Already handled in refreshWorkflowProgress
  } else if (progress.status === "RUNNING") {
    // Ensure workflow is in RUNNING state
    await transitionWorkflow(workflowId, "PENDING", "RUNNING", {
      startedAt: new Date(),
    });
  }

  const nextExecutable = await getExecutableTasks(workflowId);

  return {
    status: progress.status,
    totalTasks: progress.totalTasks,
    completedTasks: progress.completedTasks,
    failedTasks: progress.failedTasks,
    nextExecutable,
  };
}

// ---------------------------------------------------------------------------
// Workflow status
// ---------------------------------------------------------------------------

/**
 * Get full workflow status including all tasks.
 */
export async function getWorkflowStatus(
  workflowId: string,
): Promise<AgentWorkflow & { tasks: AgentTask[] }> {
  return prisma.agentWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      tasks: {
        orderBy: [{ parallelGroup: "asc" }, { sequenceOrder: "asc" }],
      },
    },
  });
}

/**
 * Build the execution context for a workflow.
 */
export async function getWorkflowContext(
  workflowId: string,
): Promise<WorkflowContext> {
  return buildContext(workflowId);
}

// ---------------------------------------------------------------------------
// Workflow lifecycle
// ---------------------------------------------------------------------------

/**
 * Cancel a workflow. Queued tasks and failed tasks are set to CANCELLED.
 *
 * RA-8429: FAILED and DEAD_LETTER are included so a cancelled workflow holds
 * no retryable task; otherwise the dead-letter review kept reading them for
 * the 90 days until cleanup deleted the workflow. A CANCELLED workflow cannot
 * be resumed (the resume route accepts FAILED and PARTIALLY_FAILED only), so
 * nothing that could still run is lost. RUNNING tasks are left to finish
 * under their lease.
 *
 * RA-8000: a task waiting for approval is cancelled too, and the workflow
 * status is a compare-and-swap: a finished or already-cancelled workflow is
 * never relabelled.
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  await withWorkflowLock(workflowId, async (tx) => {
    const swapped = await tx.agentWorkflow.updateMany({
      where: {
        id: workflowId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });
    if (swapped.count === 0) return;

    await tx.agentTask.updateMany({
      where: {
        workflowId,
        status: {
          in: ["PENDING", "READY", "AWAITING_APPROVAL", "FAILED", "DEAD_LETTER"],
        },
      },
      data: { status: "CANCELLED" },
    });
  });
}

/**
 * Resume a failed or partially-failed workflow by re-queuing failed tasks.
 *
 * RA-8000: refuses (ApprovalPendingError) while any task waits for approval:
 * approve, reject or cancel are the only exits from that pause. The workflow
 * status write is a compare-and-swap; a workflow that changed state under the
 * caller throws WorkflowStateChangedError and nothing is written.
 */
export async function resumeWorkflow(
  workflowId: string,
): Promise<{ retriedCount: number }> {
  // The lock is the first statement: the waiting-task read below must see any
  // pause another writer committed, and the status swap must not undo it.
  return withWorkflowLock(workflowId, async (tx) => {
    const waiting = await tx.agentTask.findFirst({
      where: { workflowId, status: "AWAITING_APPROVAL" },
      select: { id: true },
    });
    if (waiting) throw new ApprovalPendingError(workflowId, waiting.id);

    // Reset workflow status to RUNNING
    const swapped = await tx.agentWorkflow.updateMany({
      where: {
        id: workflowId,
        status: { in: ["FAILED", "PARTIALLY_FAILED", "PAUSED"] },
      },
      data: {
        status: "RUNNING",
        completedAt: null,
        errorMessage: null,
        failedTasks: 0,
      },
    });
    if (swapped.count === 0) throw new WorkflowStateChangedError(workflowId);

    const result = await tx.agentTask.updateMany({
      where: {
        workflowId,
        status: { in: ["FAILED", "DEAD_LETTER"] },
      },
      data: {
        status: "READY",
        errorMessage: null,
        errorCode: null,
        attempts: 0,
      },
    });

    // RA-7999: dependents skipped by the failure cascade run again too;
    // otherwise the resumed workflow would complete with steps missing.
    await unskipUpstreamFailed(tx, workflowId);

    return { retriedCount: result.count };
  });
}
