import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { applyRateLimit } from '@/lib/rate-limiter'
import { prisma } from '@/lib/prisma'
import {
  getExecutableTasks,
  advanceWorkflow,
  getWorkflowContext,
  executeBatch,
} from '@/lib/agents'

/**
 * POST /api/agents/workflows/[id]/execute — Poll-based workflow executor
 *
 * Each call claims and runs the next batch of READY tasks.
 * Client polls this endpoint until the workflow reaches a terminal state.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: 30 execution polls per minute
    const rateLimited = applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 60_000,
      prefix: 'agent-execute',
    })
    if (rateLimited) return rateLimited

    const { id: workflowId } = await params

    // Verify workflow belongs to user
    const owned = await prisma.agentWorkflow.findFirst({
      where: { id: workflowId, userId: session.user.id },
      select: { id: true, status: true, completedTasks: true, totalTasks: true, failedTasks: true },
    })
    if (!owned) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // If workflow is already in a terminal state, return immediately
    if (['COMPLETED', 'FAILED', 'PARTIALLY_FAILED', 'CANCELLED'].includes(owned.status)) {
      return NextResponse.json({
        workflowId,
        status: owned.status,
        message: `Workflow is already ${owned.status.toLowerCase()}`,
        completedTasks: owned.completedTasks,
        totalTasks: owned.totalTasks,
        failedTasks: owned.failedTasks,
      })
    }

    // Advance workflow — promotes PENDING tasks to READY if dependencies are met
    await advanceWorkflow(workflowId)

    // Get tasks that are ready to execute
    const readyTasks = await getExecutableTasks(workflowId)

    if (readyTasks.length === 0) {
      const updated = await prisma.agentWorkflow.findUnique({
        where: { id: workflowId },
        select: { status: true, completedTasks: true, totalTasks: true, failedTasks: true },
      })
      return NextResponse.json({
        workflowId,
        status: updated?.status ?? owned.status,
        message: 'No tasks ready for execution',
        completedTasks: updated?.completedTasks ?? owned.completedTasks,
        totalTasks: updated?.totalTasks ?? owned.totalTasks,
        failedTasks: updated?.failedTasks ?? owned.failedTasks,
        tasksExecuted: 0,
      })
    }

    // Build execution context from completed task outputs
    const context = await getWorkflowContext(workflowId)

    // Execute all ready tasks in parallel
    const results = await executeBatch(readyTasks, context)

    // Get updated workflow status
    const finalStatus = await prisma.agentWorkflow.findUnique({
      where: { id: workflowId },
      select: { status: true, completedTasks: true, totalTasks: true, failedTasks: true },
    })

    return NextResponse.json({
      workflowId,
      status: finalStatus?.status ?? 'RUNNING',
      tasksExecuted: results.length,
      results: results.map((r) => ({
        taskId: r.taskId,
        status: r.status,
        error: r.error,
      })),
      completedTasks: finalStatus?.completedTasks ?? 0,
      totalTasks: finalStatus?.totalTasks ?? 0,
      failedTasks: finalStatus?.failedTasks ?? 0,
    })
  } catch (error) {
    console.error('Error executing workflow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
