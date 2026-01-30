import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resumeWorkflow } from '@/lib/agents'

/**
 * POST /api/agents/workflows/[id]/resume — Resume a failed or paused workflow
 *
 * Retries failed tasks and re-marks them as READY for execution.
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

    const { id: workflowId } = await params

    // Verify workflow belongs to user and check status
    const workflow = await prisma.agentWorkflow.findFirst({
      where: { id: workflowId, userId: session.user.id },
      select: { id: true, status: true },
    })
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Only allow resuming failed, partially failed, or paused workflows
    if (!['FAILED', 'PARTIALLY_FAILED', 'PAUSED'].includes(workflow.status)) {
      return NextResponse.json(
        { error: `Cannot resume workflow with status: ${workflow.status}. Only FAILED, PARTIALLY_FAILED, or PAUSED workflows can be resumed.` },
        { status: 400 }
      )
    }

    const result = await resumeWorkflow(workflowId)

    return NextResponse.json({
      workflowId,
      message: 'Workflow resumed — poll the execute endpoint to continue',
      status: 'RUNNING',
      retriedTasks: result.retriedCount,
    })
  } catch (error) {
    console.error('Error resuming workflow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
