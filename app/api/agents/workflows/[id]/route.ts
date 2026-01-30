import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getWorkflowStatus, cancelWorkflow } from '@/lib/agents'

async function verifyWorkflowOwnership(workflowId: string, userId: string) {
  return prisma.agentWorkflow.findFirst({
    where: { id: workflowId, userId },
    select: { id: true },
  })
}

/**
 * GET /api/agents/workflows/[id] — Get workflow status and task details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const owned = await verifyWorkflowOwnership(id, session.user.id)
    if (!owned) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const status = await getWorkflowStatus(id)
    return NextResponse.json(status)
  } catch (error) {
    console.error('Error fetching workflow status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/workflows/[id] — Cancel a workflow
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const owned = await verifyWorkflowOwnership(id, session.user.id)
    if (!owned) {
      return NextResponse.json({ error: 'Workflow not found or cannot be cancelled' }, { status: 404 })
    }

    await cancelWorkflow(id)

    return NextResponse.json({ message: 'Workflow cancelled', workflowId: id })
  } catch (error) {
    console.error('Error cancelling workflow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
