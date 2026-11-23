/**
 * State Manager — persistence and atomic state transitions for workflows and tasks.
 *
 * All transitions use optimistic concurrency control: the update WHERE clause
 * includes the expected current status, so concurrent mutations are detected
 * and rejected (updateCount === 0).
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, WorkflowStatus } from "@prisma/client";
import type { WorkflowContext, TaskOutput } from "./types";
import { logAgentEvent } from "./logger";
import { withWorkflowLock } from "./workflow-lock";

// Task claims and every write after a claim live in executor.ts / lease.ts
// (RA-7999): they are guarded by the claim's lease token, not by status alone.

/**
 * Atomically transition a workflow status.
 */
export async function transitionWorkflow(
  workflowId: string,
  from: WorkflowStatus,
  to: WorkflowStatus,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const result = await prisma.agentWorkflow.updateMany({
    where: { id: workflowId, status: from },
    data: { status: to, ...data },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Task readiness
// ---------------------------------------------------------------------------

/**
 * Scan all PENDING tasks in a workflow and promote those whose
 * dependencies are fully COMPLETED. A task whose own row says
 * `requiresApproval` goes to AWAITING_APPROVAL instead of READY (RA-8000), and
 * the workflow moves to PAUSED in the same transaction with a compare-and-swap:
 * if that matches nothing (a cancel landed mid-flight) the transaction aborts
 * and the promotion is undone.
 * Returns the number of tasks promoted.
 */
export async function markTasksReady(workflowId: string): Promise<number> {
  try {
    const promotedForApproval: string[] = [];
    const promoted = await withWorkflowLock(workflowId, async (tx) => {
      const tasks = await tx.agentTask.findMany({
        where: { workflowId },
        select: {
          id: true,
          status: true,
          dependsOnTaskIds: true,
          requiresApproval: true,
        },
      });

      const completedIds = new Set(
        tasks.filter((t) => t.status === "COMPLETED").map((t) => t.id),
      );

      const toPromote = tasks.filter(
        (t) =>
          t.status === "PENDING" &&
          t.dependsOnTaskIds.every((depId) => completedIds.has(depId)),
      );
      if (toPromote.length === 0) return 0;

      const plain = toPromote.filter((t) => !t.requiresApproval);
      const gated = toPromote.filter((t) => t.requiresApproval);
      let count = 0;

      if (plain.length > 0) {
        const result = await tx.agentTask.updateMany({
          where: { id: { in: plain.map((t) => t.id) }, status: "PENDING" },
          data: { status: "READY" },
        });
        count += result.count;
      }

      if (gated.length > 0) {
        const result = await tx.agentTask.updateMany({
          where: { id: { in: gated.map((t) => t.id) }, status: "PENDING" },
          data: {
            status: "AWAITING_APPROVAL",
            approvalRequestedAt: new Date(),
          },
        });
        if (result.count > 0) {
          const paused = await tx.agentWorkflow.updateMany({
            where: { id: workflowId, status: { in: ["RUNNING", "PAUSED"] } },
            data: { status: "PAUSED" },
          });
          if (paused.count === 0) throw new WorkflowNotPausableError(workflowId);
          promotedForApproval.push(...gated.map((t) => t.id));
        }
        count += result.count;
      }

      return count;
    });

    for (const taskId of promotedForApproval) {
      await logAgentEvent(taskId, "info", "Task is awaiting approval", {
        workflowId,
      });
    }
    return promoted;
  } catch (err) {
    if (err instanceof WorkflowNotPausableError) {
      console.warn("[agent-approval] promotion undone: workflow not running", {
        workflowId,
      });
      return 0;
    }
    throw err;
  }
}

class WorkflowNotPausableError extends Error {
  constructor(workflowId: string) {
    super(`Workflow ${workflowId} cannot be paused for approval`);
    this.name = "WorkflowNotPausableError";
  }
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

/**
 * Build a WorkflowContext by aggregating outputs from all completed tasks.
 */
export async function buildContext(
  workflowId: string,
): Promise<WorkflowContext> {
  const workflow = await prisma.agentWorkflow.findUniqueOrThrow({
    where: { id: workflowId },
    select: {
      id: true,
      userId: true,
      reportId: true,
      inspectionId: true,
      config: true,
    },
  });

  const completedTasks = await prisma.agentTask.findMany({
    where: { workflowId, status: "COMPLETED" },
    select: { agentSlug: true, output: true },
  });

  const completedOutputs: Record<string, TaskOutput> = {};
  for (const task of completedTasks) {
    if (task.output) {
      try {
        completedOutputs[task.agentSlug] = JSON.parse(
          task.output,
        ) as TaskOutput;
      } catch {
        // Skip malformed output
      }
    }
  }

  const sharedState = workflow.config ? JSON.parse(workflow.config) : {};

  return {
    workflowId,
    userId: workflow.userId,
    reportId: workflow.reportId ?? undefined,
    inspectionId: workflow.inspectionId ?? undefined,
    completedOutputs,
    sharedState,
  };
}

// ---------------------------------------------------------------------------
// Workflow progress
// ---------------------------------------------------------------------------

/**
 * Recalculate and persist workflow counters (completedTasks, failedTasks)
 * and determine if the workflow has reached a terminal state.
 *
 * RA-8000: the status write is a compare-and-swap on PENDING or RUNNING, so a
 * CANCELLED, PAUSED or already-terminal workflow is never overwritten, and
 * COMPLETED is never computed while any task is cancelled.
 */
export async function refreshWorkflowProgress(
  workflowId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<{
  status: WorkflowStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}> {
  const tasks = await db.agentTask.findMany({
    where: { workflowId },
    select: { status: true },
  });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const failed = tasks.filter(
    (t) => t.status === "FAILED" || t.status === "DEAD_LETTER",
  ).length;
  const skipped = tasks.filter((t) => t.status === "SKIPPED").length;
  const cancelled = tasks.filter((t) => t.status === "CANCELLED").length;

  const finished = completed + failed + skipped + cancelled;

  let newStatus: WorkflowStatus;
  if (finished === total && cancelled > 0) {
    newStatus = "CANCELLED";
  } else if (finished === total && failed === 0) {
    newStatus = "COMPLETED";
  } else if (finished === total && failed > 0 && completed > 0) {
    newStatus = "PARTIALLY_FAILED";
  } else if (finished === total && completed === 0) {
    newStatus = "FAILED";
  } else {
    newStatus = "RUNNING";
  }

  await db.agentWorkflow.updateMany({
    where: { id: workflowId },
    data: { totalTasks: total, completedTasks: completed, failedTasks: failed },
  });

  let status: WorkflowStatus = newStatus;
  if (newStatus !== "RUNNING") {
    const written = await db.agentWorkflow.updateMany({
      where: { id: workflowId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: newStatus, completedAt: new Date() },
    });
    if (written.count === 0) {
      // Lost the swap: report what the workflow actually is.
      const current = await db.agentWorkflow.findUnique({
        where: { id: workflowId },
        select: { status: true },
      });
      if (current) status = current.status;
    }
  }

  return {
    status,
    totalTasks: total,
    completedTasks: completed,
    failedTasks: failed,
  };
}
