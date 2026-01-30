import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTaskLogs } from '@/lib/agents'

/**
 * GET /api/agents/tasks/[id] — Get task details with logs
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

    const { id: taskId } = await params

    const task = await prisma.agentTask.findFirst({
      where: {
        id: taskId,
        workflow: {
          userId: session.user.id,
        },
      },
      select: {
        id: true,
        workflowId: true,
        agentSlug: true,
        taskType: true,
        displayName: true,
        sequenceOrder: true,
        parallelGroup: true,
        dependsOnTaskIds: true,
        input: true,
        output: true,
        status: true,
        priority: true,
        attempts: true,
        maxRetries: true,
        startedAt: true,
        completedAt: true,
        lastAttemptAt: true,
        durationMs: true,
        errorMessage: true,
        errorCode: true,
        provider: true,
        model: true,
        tokensUsed: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Parse JSON fields for response
    let parsedInput = null
    let parsedOutput = null
    try {
      parsedInput = task.input ? JSON.parse(task.input) : null
    } catch {
      parsedInput = task.input
    }
    try {
      parsedOutput = task.output ? JSON.parse(task.output) : null
    } catch {
      parsedOutput = task.output
    }

    // Get logs for this task
    const url = new URL(request.url)
    const logLimit = Math.min(parseInt(url.searchParams.get('logLimit') ?? '100'), 500)
    const logs = await getTaskLogs(taskId, { limit: logLimit })

    return NextResponse.json({
      ...task,
      input: parsedInput,
      output: parsedOutput,
      logs,
    })
  } catch (error) {
    console.error('Error fetching task details:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
