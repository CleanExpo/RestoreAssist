import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkflowStatus, cancelWorkflow } from "@/lib/agents";
import { apiError, fromException } from "@/lib/api-errors";

async function verifyWorkflowOwnership(workflowId: string, userId: string) {
  return prisma.agentWorkflow.findFirst({
    where: { id: workflowId, userId },
    select: { id: true },
  });
}

/**
 * GET /api/agents/workflows/[id] — Get workflow status and task details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const owned = await verifyWorkflowOwnership(id, session.user.id);
    if (!owned) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Workflow not found",
        status: 404,
      });
    }

    const status = await getWorkflowStatus(id);
    return NextResponse.json(status);
  } catch (error) {
    return fromException(request, error, { stage: "agents-workflow-get" });
  }
}

/**
 * DELETE /api/agents/workflows/[id] — Cancel a workflow
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const owned = await verifyWorkflowOwnership(id, session.user.id);
    if (!owned) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Workflow not found or cannot be cancelled",
        status: 404,
      });
    }

    await cancelWorkflow(id);

    return NextResponse.json({ message: "Workflow cancelled", workflowId: id });
  } catch (error) {
    return fromException(request, error, { stage: "agents-workflow-cancel" });
  }
}
