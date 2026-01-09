import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/forms/[id]
 * Get a specific form submission or template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params

    // Try to get as submission first
    let submission = await prisma.formSubmission.findUnique({
      where: { id },
      include: {
        template: true,
        signatures: true,
        attachments: true,
        auditLogs: true,
      },
    })

    if (submission) {
      // Verify ownership
      if (submission.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      // Parse form data
      const formData = JSON.parse(submission.formData)

      return NextResponse.json({
        success: true,
        type: 'submission',
        data: {
          ...submission,
          formData,
        },
      })
    }

    // Try to get as template
    const template = await prisma.formTemplate.findUnique({
      where: { id },
      include: {
        submissions: {
          select: { id: true, submissionNumber: true, status: true },
          take: 5,
        },
        versions: true,
      },
    })

    if (template) {
      // Verify ownership
      if (template.userId !== session.user.id && !template.isSystemTemplate) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      // Parse form schema
      const formSchema = JSON.parse(template.formSchema)

      return NextResponse.json({
        success: true,
        type: 'template',
        data: {
          ...template,
          formSchema,
        },
      })
    }

    return NextResponse.json(
      { error: 'Form not found' },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error fetching form:', error)
    return NextResponse.json(
      { error: 'Failed to fetch form' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/forms/[id]
 * Update a form submission or template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params
    const data = await request.json()

    // Try to update as submission
    const submission = await prisma.formSubmission.findUnique({
      where: { id },
    })

    if (submission) {
      // Verify ownership
      if (submission.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      const updated = await prisma.formSubmission.update({
        where: { id },
        data: {
          formData: data.formData ? JSON.stringify(data.formData) : undefined,
          status: data.status,
          completenessScore: data.completenessScore,
          lastSavedAt: new Date(),
        },
      })

      // Log the update
      if (data.formData) {
        await prisma.formAuditLog.create({
          data: {
            submissionId: id,
            action: 'FIELD_UPDATED',
            userId: session.user.id,
            newValue: JSON.stringify(data.formData),
          },
        })
      }

      return NextResponse.json({
        success: true,
        data: updated,
      })
    }

    // Try to update as template
    const template = await prisma.formTemplate.findUnique({
      where: { id },
    })

    if (template) {
      // Verify ownership
      if (template.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      const updated = await prisma.formTemplate.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          formSchema: data.formSchema ? JSON.stringify(data.formSchema) : undefined,
          status: data.status,
          isActive: data.isActive,
        },
      })

      return NextResponse.json({
        success: true,
        data: updated,
      })
    }

    return NextResponse.json(
      { error: 'Form not found' },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error updating form:', error)
    return NextResponse.json(
      { error: 'Failed to update form' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/forms/[id]
 * Delete a form submission or template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params

    // Try to delete as submission
    const submission = await prisma.formSubmission.findUnique({
      where: { id },
    })

    if (submission) {
      // Verify ownership
      if (submission.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      // Soft delete by setting status to CANCELLED
      await prisma.formSubmission.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })

      return NextResponse.json({
        success: true,
        message: 'Form submission cancelled',
      })
    }

    // Try to delete as template
    const template = await prisma.formTemplate.findUnique({
      where: { id },
    })

    if (template) {
      // Verify ownership
      if (template.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      // Archive template instead of deleting
      await prisma.formTemplate.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      })

      return NextResponse.json({
        success: true,
        message: 'Form template archived',
      })
    }

    return NextResponse.json(
      { error: 'Form not found' },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error deleting form:', error)
    return NextResponse.json(
      { error: 'Failed to delete form' },
      { status: 500 }
    )
  }
}
