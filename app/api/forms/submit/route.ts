import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import prisma from '@/lib/prisma'

/**
 * POST /api/forms/submit
 * Submit a completed form
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

    const { templateId, formData, reportId } = await request.json()

    if (!templateId || !formData) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, formData' },
        { status: 400 }
      )
    }

    // Generate submission number (e.g., WO-2026-001)
    const templatePrefix = templateId.split('-')[0].toUpperCase()
    const submissionCount = await prisma.formSubmission.count()
    const submissionNumber = `${templatePrefix}-${new Date().getFullYear()}-${String(submissionCount + 1).padStart(3, '0')}`

    // Create form submission
    const submission = await prisma.formSubmission.create({
      data: {
        templateId,
        userId: session.user.id,
        reportId: reportId || null,
        submissionNumber,
        status: 'COMPLETED',
        formData: JSON.stringify(formData),
        completenessScore: 100,
        submittedAt: new Date(),
        completedAt: new Date(),
      },
    })

    // Log the submission in audit trail
    await prisma.formAuditLog.create({
      data: {
        submissionId: submission.id,
        action: 'SUBMITTED',
        userId: session.user.id,
        newValue: JSON.stringify(formData),
      },
    })

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      submissionNumber: submission.submissionNumber,
    })
  } catch (error) {
    console.error('Error submitting form:', error)
    return NextResponse.json(
      { error: 'Failed to submit form' },
      { status: 500 }
    )
  }
}
