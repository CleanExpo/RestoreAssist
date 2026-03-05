import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { applyRateLimit } from '@/lib/rate-limiter'
import { prisma } from '@/lib/prisma'
import { createWorkflow, quickAssessmentWorkflow } from '@/lib/agents'

const WORKFLOW_TEMPLATES: Record<string, any> = {
  'quick-assessment': quickAssessmentWorkflow,
}

/**
 * POST /api/agents/workflows — Create a new workflow
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: 10 workflow creations per 15 minutes
    const rateLimited = applyRateLimit(request, { maxRequests: 10, prefix: 'agent-workflows' })
    if (rateLimited) return rateLimited

    const body = await request.json()
    const { workflow: templateName, reportId, inspectionId, config } = body

    if (!templateName) {
      return NextResponse.json({ error: 'Workflow template name is required' }, { status: 400 })
    }

    const template = WORKFLOW_TEMPLATES[templateName]
    if (!template) {
      return NextResponse.json(
        { error: `Unknown workflow template: ${templateName}. Available: ${Object.keys(WORKFLOW_TEMPLATES).join(', ')}` },
        { status: 400 }
      )
    }

    const result = await createWorkflow(template, {
      userId: session.user.id,
      reportId,
      inspectionId,
      config,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating workflow:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/agents/workflows — List user's workflows
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50)
    const status = url.searchParams.get('status') ?? undefined

    const workflows = await prisma.agentWorkflow.findMany({
      where: {
        userId: session.user.id,
        ...(status ? { status: status as any } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        totalTasks: true,
        completedTasks: true,
        failedTasks: true,
        reportId: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ workflows, count: workflows.length })
  } catch (error) {
    console.error('Error listing workflows:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
