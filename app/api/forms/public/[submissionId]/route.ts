import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySignatureToken, logSignatureAction, isTokenAlreadyUsed } from '@/lib/forms/signature-tokens'

/**
 * GET /api/forms/public/[submissionId]
 * Public endpoint for accessing forms via signature token
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Missing signature token' }, { status: 401 })
    }

    // Verify token
    const tokenVerification = verifySignatureToken(token)
    if (!tokenVerification.isValid) {
      return NextResponse.json(
        { error: tokenVerification.error || 'Invalid or expired token' },
        { status: 401 },
      )
    }

    const tokenPayload = tokenVerification.payload!

    // Verify token submission matches URL parameter
    if (tokenPayload.submissionId !== params.submissionId) {
      return NextResponse.json({ error: 'Token does not match submission' }, { status: 401 })
    }

    // Check if token already used
    const alreadyUsed = await isTokenAlreadyUsed(token)
    if (alreadyUsed) {
      return NextResponse.json(
        { error: 'This form has already been signed' },
        { status: 410 },
      )
    }

    // Fetch submission
    const submission = await prisma.formSubmission.findUnique({
      where: { id: params.submissionId },
      include: {
        template: true,
        user: true,
      },
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Log view action
    await logSignatureAction(params.submissionId, tokenPayload.signatureFieldId, 'viewed', {
      signatoryEmail: tokenPayload.signatoryEmail,
      timestamp: new Date().toISOString(),
    })

    // Create audit log for form access
    await prisma.formAuditLog.create({
      data: {
        submissionId: params.submissionId,
        action: 'FORM_ACCESSED_FOR_SIGNATURE',
        metadata: JSON.stringify({
          signatoryName: tokenPayload.signatoryName,
          signatoryEmail: tokenPayload.signatoryEmail,
          signatureFieldId: tokenPayload.signatureFieldId,
          expiresAt: tokenPayload.expiresAt.toISOString(),
        }),
      },
    })

    // Return form data
    return NextResponse.json({
      submission: {
        id: submission.id,
        signatoryName: tokenPayload.signatoryName,
        signatoryEmail: tokenPayload.signatoryEmail,
        formName: submission.template.name,
        createdAt: submission.createdAt,
      },
      formSchema: submission.template.formSchema,
      formData: submission.formData,
    })
  } catch (error) {
    console.error('Error fetching public form:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
