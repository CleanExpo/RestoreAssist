import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import prisma from '@/lib/prisma'

/**
 * GET /api/forms
 * List all form templates and submissions for the user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get filter parameters
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // 'templates' or 'submissions'
    const status = searchParams.get('status') // DRAFT, IN_PROGRESS, COMPLETED, etc.

    if (type === 'templates') {
      // Get form templates
      const templates = await prisma.formTemplate.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          id: true,
          name: true,
          description: true,
          formType: true,
          category: true,
          status: true,
          version: true,
          isSystemTemplate: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { submissions: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })

      return NextResponse.json({
        success: true,
        templates,
      })
    }

    if (type === 'submissions') {
      // Get form submissions
      const where: any = { userId: session.user.id }
      if (status) {
        where.status = status
      }

      const submissions = await prisma.formSubmission.findMany({
        where,
        include: {
          template: {
            select: {
              id: true,
              name: true,
              formType: true,
            },
          },
          report: {
            select: {
              id: true,
              reportNumber: true,
            },
          },
          _count: {
            select: { signatures: true, attachments: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })

      return NextResponse.json({
        success: true,
        submissions,
      })
    }

    // Default: return both templates and submissions
    const [templates, submissions] = await Promise.all([
      prisma.formTemplate.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          id: true,
          name: true,
          formType: true,
          status: true,
        },
      }),
      prisma.formSubmission.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          id: true,
          submissionNumber: true,
          status: true,
        },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      templates,
      submissions,
    })
  } catch (error) {
    console.error('Error fetching forms:', error)
    return NextResponse.json(
      { error: 'Failed to fetch forms' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/forms
 * Create a new form template
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { name, description, formType, category, formSchema } = await request.json()

    if (!name || !formType) {
      return NextResponse.json(
        { error: 'Missing required fields: name, formType' },
        { status: 400 }
      )
    }

    const template = await prisma.formTemplate.create({
      data: {
        userId: session.user.id,
        name,
        description,
        formType,
        category: category || 'CUSTOM',
        formSchema: JSON.stringify(formSchema || {}),
        createdBy: session.user.name || session.user.email || 'Unknown',
      },
    })

    return NextResponse.json({
      success: true,
      template,
    })
  } catch (error) {
    console.error('Error creating form template:', error)
    return NextResponse.json(
      { error: 'Failed to create form template' },
      { status: 500 }
    )
  }
}
