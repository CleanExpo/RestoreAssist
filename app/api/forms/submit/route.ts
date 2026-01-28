/**
 * Form Submission API
 * POST /api/forms/submit
 * Submit interview-populated form data
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Generate submission number (e.g., "WO-2026-001")
 */
function generateSubmissionNumber(): string {
  const year = new Date().getFullYear()
  const prefix = 'WO'
  
  // Get the latest submission number for this year
  // For now, use timestamp-based approach
  const timestamp = Date.now().toString().slice(-6)
  return `${prefix}-${year}-${timestamp}`
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { templateId, formData, reportId, saveDraft = true, metadata } = body

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 })
    }

    // Verify template exists
    const template = await prisma.formTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      return NextResponse.json({ error: 'Form template not found' }, { status: 404 })
    }

    // Verify report exists if reportId provided
    if (reportId) {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
      })

      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
    }

    // Generate submission number
    const submissionNumber = generateSubmissionNumber()

    // Create form submission
    const submission = await prisma.formSubmission.create({
      data: {
        templateId,
        userId: user.id,
        reportId: reportId || null,
        submissionNumber,
        status: saveDraft ? 'DRAFT' : 'IN_PROGRESS',
        formData: JSON.stringify(formData),
        startedAt: new Date(),
        lastSavedAt: new Date(),
        ...(metadata && {
          // Store metadata in formData or create a separate metadata field if needed
          // For now, we'll merge it into formData
        }),
      },
    })

    // If metadata contains interview information, we could store it separately
    // For now, we'll include it in the response

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      submissionNumber: submission.submissionNumber,
      status: submission.status,
      metadata: metadata || {},
    })
  } catch (error) {
    console.error('Error submitting form:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to submit form',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
