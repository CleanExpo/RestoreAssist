import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";
import {
  getExecutableTasks,
  advanceWorkflow,
  getWorkflowContext,
  executeBatch,
  sweepExpiredLeases,
} from "@/lib/agents";
import { BYOK_ONLY_AGENT_SLUGS } from "@/lib/agents/ai-bridge";
import {
  agentKeyPreflight,
  agentSubscriptionGate,
} from "@/lib/agents/route-gates";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/agents/workflows/[id]/execute — Poll-based workflow executor
 *
 * Each call claims and runs the next batch of READY tasks.
 * Client polls this endpoint until the workflow reaches a terminal state.
 */
export async function POST(
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

    // Rate limit: 30 execution polls per minute
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 60_000,
      prefix: "agent-execute",
    });
    if (rateLimited) return rateLimited;

    const { id: workflowId } = await params;

    // Verify workflow belongs to user
    const owned = await prisma.agentWorkflow.findFirst({
      where: { id: workflowId, userId: session.user.id },
      select: {
        id: true,
        status: true,
        completedTasks: true,
        totalTasks: true,
        failedTasks: true,
      },
    });
    if (!owned) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Workflow not found",
        status: 404,
      });
    }

    // RA-7999: recover this workflow's crashed tasks on the owner's next poll.
    // Scoped to this (owned) workflow; expired leases go back to READY or to
    // DEAD_LETTER, and legacy unleased rows are never replayed.
    const swept = await sweepExpiredLeases({ workflowId });
    const sweptAny =
      swept.reclaimed +
        swept.deadLettered +
        swept.legacyUnleased +
        swept.cancelled >
      0;
    const current = sweptAny
      ? await prisma.agentWorkflow.findUniqueOrThrow({
          where: { id: workflowId },
          select: {
            id: true,
            status: true,
            completedTasks: true,
            totalTasks: true,
            failedTasks: true,
          },
        })
      : owned;

    // If workflow is already in a terminal state, return immediately
    if (
      ["COMPLETED", "FAILED", "PARTIALLY_FAILED", "CANCELLED"].includes(
        current.status,
      )
    ) {
      return NextResponse.json({
        workflowId,
        status: current.status,
        message: `Workflow is already ${current.status.toLowerCase()}`,
        completedTasks: current.completedTasks,
        totalTasks: current.totalTasks,
        failedTasks: current.failedTasks,
      });
    }

    // RA-8001: G1 then the key preflight, after the terminal early return (a
    // finished workflow stays readable) and before any task is claimed. A
    // refusal leaves the workflow and its READY tasks untouched.
    const gate = {
      route: "agents-workflow-execute",
      userId: session.user.id,
      ids: { workflowId },
    };
    const inactive = await agentSubscriptionGate(request, gate);
    if (inactive) return inactive;

    let byokTasks: number;
    try {
      byokTasks = await prisma.agentTask.count({
        where: {
          AND: [
            { workflowId },
            { status: { in: ["PENDING", "READY", "RUNNING"] } },
            { agentSlug: { in: [...BYOK_ONLY_AGENT_SLUGS] } },
          ],
        },
      });
    } catch (err) {
      return apiError(request, {
        code: "GOVERNOR_UNAVAILABLE",
        message: "AI access could not be checked right now. Please try again shortly.",
        status: 503,
        err,
        stage: gate.route,
        context: { userId: gate.userId, reason: "key-preflight", workflowId },
      });
    }
    if (byokTasks > 0) {
      const refused = await agentKeyPreflight(request, gate);
      if (refused) return refused;
    }

    // Advance workflow — promotes PENDING tasks to READY if dependencies are met
    await advanceWorkflow(workflowId);

    // Get tasks that are ready to execute
    const readyTasks = await getExecutableTasks(workflowId);

    if (readyTasks.length === 0) {
      const updated = await prisma.agentWorkflow.findUnique({
        where: { id: workflowId },
        select: {
          status: true,
          completedTasks: true,
          totalTasks: true,
          failedTasks: true,
        },
      });
      return NextResponse.json({
        workflowId,
        status: updated?.status ?? owned.status,
        message: "No tasks ready for execution",
        completedTasks: updated?.completedTasks ?? owned.completedTasks,
        totalTasks: updated?.totalTasks ?? owned.totalTasks,
        failedTasks: updated?.failedTasks ?? owned.failedTasks,
        tasksExecuted: 0,
      });
    }

    // Build execution context from completed task outputs
    const context = await getWorkflowContext(workflowId);

    // Execute all ready tasks in parallel
    const results = await executeBatch(readyTasks, context);

    // Get updated workflow status
    const finalStatus = await prisma.agentWorkflow.findUnique({
      where: { id: workflowId },
      select: {
        status: true,
        completedTasks: true,
        totalTasks: true,
        failedTasks: true,
      },
    });

    return NextResponse.json({
      workflowId,
      status: finalStatus?.status ?? "RUNNING",
      tasksExecuted: results.length,
      results: results.map((r) => ({
        taskId: r.taskId,
        status: r.status,
        error: r.error,
      })),
      completedTasks: finalStatus?.completedTasks ?? 0,
      totalTasks: finalStatus?.totalTasks ?? 0,
      failedTasks: finalStatus?.failedTasks ?? 0,
    });
  } catch (error) {
    return fromException(request, error, { stage: "agents-workflow-execute" });
  }
}
