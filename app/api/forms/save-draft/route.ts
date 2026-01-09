import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import prisma from '@/lib/prisma'

/**
 * POST /api/forms/save-draft
 * Save a form as draft
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

    const { templateId, formData, reportId, submissionId } = await request.json()

    if (!templateId || !formData) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, formData' },
        { status: 400 }
      )
    }

    let submission

    if (submissionId) {
      // Update existing draft
      submission = await prisma.formSubmission.update({
        where: { id: submissionId },
        data: {
          formData: JSON.stringify(formData),
          lastSavedAt: new Date(),
          status: 'DRAFT',
        },
      })

      // Log the update
      await prisma.formAuditLog.create({
        data: {
          submissionId: submission.id,
          action: 'SAVED',
          userId: session.user.id,
          newValue: JSON.stringify(formData),
        },
      })
    } else {
      // Create new draft
      const templatePrefix = templateId.split('-')[0].toUpperCase()
      const submissionCount = await prisma.formSubmission.count()
      const submissionNumber = `${templatePrefix}-${new Date().getFullYear()}-${String(submissionCount + 1).padStart(3, '0')}`

      submission = await prisma.formSubmission.create({
        data: {
          templateId,
          userId: session.user.id,
          reportId: reportId || null,
          submissionNumber,
          status: 'DRAFT',
          formData: JSON.stringify(formData),
          completenessScore: calculateCompletenessScore(formData),
        },
      })

      // Log the creation
      await prisma.formAuditLog.create({
        data: {
          submissionId: submission.id,
          action: 'CREATED',
          userId: session.user.id,
          newValue: JSON.stringify(formData),
        },
      })
    }

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      submissionNumber: submission.submissionNumber,
      message: 'Draft saved successfully',
    })
  } catch (error) {
    console.error('Error saving draft:', error)
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 }
    )
  }
}

/**
 * Calculate form completeness score (0-100)
 */
function calculateCompletenessScore(formData: Record<string, any>): number {
  const fields = Object.values(formData).filter(val => val !== null && val !== undefined && val !== '')
  const totalFields = Object.keys(formData).length

  if (totalFields === 0) return 0
  return Math.round((fields.length / totalFields) * 100)
}
