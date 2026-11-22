/**
 * Approval decisions for agent tasks (RA-8000, durable agents slice 1b).
 *
 * A task whose row says `requiresApproval` waits in AWAITING_APPROVAL, and its
 * workflow is PAUSED, until the workflow's owner approves or rejects it. The
 * invariant: a workflow is PAUSED exactly while at least one of its tasks is
 * AWAITING_APPROVAL, and only approve, reject or cancel move it out.
 *
 * decideApproval is the one writer for approve and reject. Everything happens
 * in one transaction whose first write is a compare-and-swap carrying the
 * tenant scope (`workflow.userId`) inside the write itself, so a decision that
 * lost a race, or belongs to another tenant, writes nothing.
 */

import { prisma } from "@/lib/prisma";
import { skipDependentsOfFailedTask } from "./lease";

export const REJECTED_BY_USER_CODE = "REJECTED_BY_USER";

/** resume was asked for a workflow that still holds a task awaiting approval. */
export class ApprovalPendingError extends Error {
  constructor(
    readonly workflowId: string,
    readonly taskId: string,
  ) {
    super(`Workflow ${workflowId} is waiting for approval of task ${taskId}`);
    this.name = "ApprovalPendingError";
  }
}

/** A guarded workflow status write matched nothing: the state moved under us. */
export class WorkflowStateChangedError extends Error {
  constructor(readonly workflowId: string) {
    super(`Workflow ${workflowId} changed state; nothing was written`);
    this.name = "WorkflowStateChangedError";
  }
}

export type ApprovalDecision = "approve" | "reject";

export interface DecideApprovalInput {
  /** Always the session user; never taken from a request body. */
  userId: string;
  workflowId: string;
  taskId: string;
  decision: ApprovalDecision;
  note?: string;
}

export type DecideApprovalResult =
  | {
      ok: true;
      decision: ApprovalDecision;
      taskId: string;
      taskStatus: string;
      workflowStatus: string;
      secondsWaited: number | null;
    }
  | { ok: false; reason: "NOT_FOUND" }
  | {
      ok: false;
      reason: "CONFLICT";
      taskStatus: string;
      workflowStatus: string;
      /** The decision that won, or null when the task left the wait another way. */
      decision: ApprovalDecision | null;
    };

/** Test seams: they let a test hold a request mid-flight or fail between writes. */
export interface DecideApprovalHooks {
  afterRead?: () => Promise<void>;
  afterTaskUpdate?: () => Promise<void>;
}

class DecisionAborted extends Error {}

export async function decideApproval(
  input: DecideApprovalInput,
  hooks: DecideApprovalHooks = {},
): Promise<DecideApprovalResult> {
  const { userId, workflowId, taskId, decision, note } = input;
  const scope = { id: taskId, workflowId, workflow: { userId } };

  const visible = await prisma.agentTask.findFirst({
    where: scope,
    select: { approvalRequestedAt: true },
  });
  if (!visible) return { ok: false, reason: "NOT_FOUND" };

  await hooks.afterRead?.();

  try {
    const done = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const moved = await tx.agentTask.updateMany({
        where: {
          AND: [
            { id: taskId, workflowId, status: "AWAITING_APPROVAL" },
            { workflow: { userId, status: "PAUSED" } },
          ],
        },
        data:
          decision === "approve"
            ? { status: "READY", approvedAt: now, approvedBy: userId }
            : {
                status: "CANCELLED",
                errorCode: REJECTED_BY_USER_CODE,
                errorMessage: "Rejected by the workflow owner",
              },
      });
      if (moved.count === 0) return null;

      await hooks.afterTaskUpdate?.();

      let workflowStatus: string;
      if (decision === "approve") {
        const stillWaiting = await tx.agentTask.count({
          where: { workflowId, status: "AWAITING_APPROVAL" },
        });
        if (stillWaiting === 0) {
          const resumed = await tx.agentWorkflow.updateMany({
            where: { id: workflowId, status: "PAUSED" },
            data: { status: "RUNNING" },
          });
          if (resumed.count === 0) throw new DecisionAborted();
          workflowStatus = "RUNNING";
        } else {
          workflowStatus = "PAUSED";
        }
      } else {
        const cancelled = await tx.agentWorkflow.updateMany({
          where: { id: workflowId, status: "PAUSED" },
          data: { status: "CANCELLED", completedAt: now },
        });
        if (cancelled.count === 0) throw new DecisionAborted();
        await skipDependentsOfFailedTask(tx, workflowId, taskId, {
          code: REJECTED_BY_USER_CODE,
          message: `Skipped: approval of task ${taskId} was rejected`,
        });
        // The workflow is over: nothing else in it may run later.
        await tx.agentTask.updateMany({
          where: {
            workflowId,
            status: { in: ["PENDING", "READY", "AWAITING_APPROVAL"] },
          },
          data: { status: "CANCELLED" },
        });
        workflowStatus = "CANCELLED";
      }

      await tx.agentTaskLog.create({
        data: {
          taskId,
          level: "info",
          message: `Recorded approval decision: ${decision}`,
          data: JSON.stringify({
            decision,
            actorId: userId,
            note: note ?? null,
          }),
        },
      });

      return { workflowStatus };
    });

    if (done) {
      const secondsWaited = visible.approvalRequestedAt
        ? Math.round((Date.now() - visible.approvalRequestedAt.getTime()) / 1000)
        : null;
      console.info("[agent-approval] decided", {
        workflowId,
        taskId,
        decision,
        secondsWaited,
      });
      return {
        ok: true,
        decision,
        taskId,
        taskStatus: decision === "approve" ? "READY" : "CANCELLED",
        workflowStatus: done.workflowStatus,
        secondsWaited,
      };
    }
  } catch (err) {
    if (!(err instanceof DecisionAborted)) throw err;
  }

  // Zero rows matched, or a step aborted and rolled everything back. A second
  // read, scoped to this user, decides between 404 and 409. It never reveals
  // another tenant's state.
  const current = await prisma.agentTask.findFirst({
    where: scope,
    select: {
      status: true,
      approvedAt: true,
      errorCode: true,
      workflow: { select: { status: true } },
    },
  });
  if (!current) return { ok: false, reason: "NOT_FOUND" };
  console.warn("[agent-approval] conflict", {
    workflowId,
    taskId,
    taskStatus: current.status,
    workflowStatus: current.workflow.status,
  });
  return {
    ok: false,
    reason: "CONFLICT",
    taskStatus: current.status,
    workflowStatus: current.workflow.status,
    decision: current.approvedAt
      ? "approve"
      : current.errorCode === REJECTED_BY_USER_CODE
        ? "reject"
        : null,
  };
}
