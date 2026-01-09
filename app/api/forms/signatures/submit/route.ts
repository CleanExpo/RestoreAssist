import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySignatureToken, logSignatureAction } from '@/lib/forms/signature-tokens'
import { sendSignatureCompletionEmail, areAllSignaturesComplete } from '@/lib/forms/email-signature-workflow'

/**
 * POST /api/forms/signatures/submit
 * Submit a signed form (public endpoint for unsigned forms)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { signatureToken, signatureData, formData, ipAddress, userAgent, gpsLocation } = body

    if (!signatureToken || !signatureData) {
      return NextResponse.json(
        { error: 'Missing required fields: signatureToken, signatureData' },
        { status: 400 },
      )
    }

    // Verify token
    const tokenVerification = verifySignatureToken(signatureToken)
    if (!tokenVerification.isValid) {
      return NextResponse.json(
        { error: tokenVerification.error || 'Invalid signature token' },
        { status: 401 },
      )
    }

    const tokenPayload = tokenVerification.payload!

    // Get current client IP if not provided
    const clientIp =
      ipAddress ||
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const clientUserAgent = userAgent || request.headers.get('user-agent') || 'unknown'

    // Update submission with form data if provided
    if (formData) {
      await prisma.formSubmission.update({
        where: { id: tokenPayload.submissionId },
        data: {
          formData,
          lastSavedAt: new Date(),
        },
      })
    }

    // Update signature record
    const signature = await prisma.formSignature.update({
      where: {
        submissionId_signatureFieldId: {
          submissionId: tokenPayload.submissionId,
          signatureFieldId: tokenPayload.signatureFieldId,
        },
      },
      data: {
        signatureData, // Base64-encoded PNG
        signatoryName: tokenPayload.signatoryName,
        signatoryEmail: tokenPayload.signatoryEmail,
        signedAt: new Date(),
        ipAddress: clientIp,
        userAgent: clientUserAgent,
        gpsLocation,
      },
    })

    // Log signature action
    await logSignatureAction(tokenPayload.submissionId, tokenPayload.signatureFieldId, 'signed', {
      signatoryName: tokenPayload.signatoryName,
      signatoryEmail: tokenPayload.signatoryEmail,
      ipAddress: clientIp,
    })

    // Create audit log
    await prisma.formAuditLog.create({
      data: {
        submissionId: tokenPayload.submissionId,
        action: 'FORM_SIGNED',
        metadata: JSON.stringify({
          signatoryName: tokenPayload.signatoryName,
          signatoryEmail: tokenPayload.signatoryEmail,
          signatureFieldId: tokenPayload.signatureFieldId,
          ipAddress: clientIp,
          timestamp: new Date().toISOString(),
        }),
      },
    })

    // Check if all signatures are complete
    const allSigned = await areAllSignaturesComplete(tokenPayload.submissionId)

    // Get submission details for email
    const submission = await prisma.formSubmission.findUnique({
      where: { id: tokenPayload.submissionId },
      include: { template: true, user: true },
    })

    if (submission && allSigned) {
      // Send completion notification to form owner
      await sendSignatureCompletionEmail(
        submission.id,
        submission.template.name,
        tokenPayload.signatoryName,
        submission.user.email,
      )

      // Update submission status to completed
      await prisma.formSubmission.update({
        where: { id: tokenPayload.submissionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Signature submitted successfully',
        allSigned,
        signature: {
          id: signature.id,
          signedAt: signature.signedAt,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error submitting signature:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
