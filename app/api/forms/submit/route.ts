import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { submitForm } from '@/lib/forms/form-submission-workflow'

/**
 * POST /api/forms/submit
 * Submit a completed form with auto-population, validation, and optional signatures
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      templateId,
      formData,
      reportId,
      clientId,
      requestSignatures,
      saveDraft,
    } = body

    if (!templateId || !formData) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, formData' },
        { status: 400 },
      )
    }

    // Submit form with full workflow
    const result = await submitForm({
      userId: session.user.id,
      templateId,
      formData,
      reportId,
      clientId,
      requestSignatures,
      saveDraft,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
          message: result.message,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      submissionId: result.submissionId,
      message: result.message,
    })
  } catch (error) {
    console.error('Error submitting form:', error)
    return NextResponse.json(
      { error: 'Failed to submit form', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
