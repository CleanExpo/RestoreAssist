import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resumeWorkflow } from "@/lib/agents";
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

      const result = await resumeWorkflow(workflowId);

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
