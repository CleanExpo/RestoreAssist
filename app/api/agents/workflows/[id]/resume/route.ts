import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ApprovalPendingError,
  WorkflowStateChangedError,
  resumeWorkflow,
} from "@/lib/agents";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/agents/workflows/[id]/resume — Resume a failed or paused workflow
 *
 * Retries failed tasks and re-marks them as READY for execution.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: workflowId } = await params;

  // RA-1266: resume marks failed tasks READY — retry without idempotency
  // can spawn duplicate task execution on the next poll.
  return withIdempotency(request, userId, async () => {
    try {
      const workflow = await prisma.agentWorkflow.findFirst({
        where: { id: workflowId, userId },
        select: { id: true, status: true },
      });
      if (!workflow) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Workflow not found",
          status: 404,
        });
      }

      if (!["FAILED", "PARTIALLY_FAILED", "PAUSED"].includes(workflow.status)) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Cannot resume workflow with status: ${workflow.status}. Only FAILED, PARTIALLY_FAILED, or PAUSED workflows can be resumed.`,
          status: 400,
        });
      }

      let result: { retriedCount: number };
      try {
        result = await resumeWorkflow(workflowId);
      } catch (err) {
        // RA-8000: approve, reject or cancel are the only exits from an
        // approval pause; resume cannot skip the wait.
        if (err instanceof ApprovalPendingError) {
          const conflict = apiError(request, {
            code: "CONFLICT",
            message:
              "This workflow is waiting for approval. Approve or reject the waiting task instead.",
            status: 409,
            stage: "agents-workflow-resume",
            fields: { taskId: err.taskId },
          });
          conflict.headers.set("X-RestoreAssist-Idempotency-No-Cache", "true");
          return conflict;
        }
        if (err instanceof WorkflowStateChangedError) {
          const conflict = apiError(request, {
            code: "CONFLICT",
            message: "The workflow changed state; check its status and try again.",
            status: 409,
            stage: "agents-workflow-resume",
          });
          conflict.headers.set("X-RestoreAssist-Idempotency-No-Cache", "true");
          return conflict;
        }
        throw err;
      }

      return NextResponse.json({
        workflowId,
        message: "Workflow resumed — poll the execute endpoint to continue",
        status: "RUNNING",
        retriedTasks: result.retriedCount,
      });
    } catch (error) {
      return fromException(request, error, { stage: "agents-workflow-resume" });
    }
  });
}
