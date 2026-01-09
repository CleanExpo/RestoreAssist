import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { SignatureType, SignatoryRole, FormAuditAction } from '@prisma/client'

/**
 * GET /api/forms/signatures
 * Retrieve signatures for a submission
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const submissionId = searchParams.get('submissionId')

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId parameter' }, { status: 400 })
    }

    const signatures = await prisma.formSignature.findMany({
      where: { submissionId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(signatures)
  } catch (error) {
    console.error('Error fetching signatures:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forms/signatures
 * Create a new signature request
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      submissionId,
      signatureFieldId,
      signatoryName,
      signatoryRole,
      signatoryEmail,
      signatureType = 'DIGITAL',
    } = body

    // Verify submission exists and belongs to user
    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: { template: true },
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    if (submission.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Create signature record
    const signature = await prisma.formSignature.create({
      data: {
        submissionId,
        signatureFieldId,
        signatureType: signatureType as SignatureType,
        signatoryName,
        signatoryRole: signatoryRole as SignatoryRole,
        signatoryEmail,
        signatureRequestSent: false,
      },
    })

    // Log audit trail
    await prisma.formAuditLog.create({
      data: {
        submissionId,
        action: FormAuditAction.SIGNATURE_REQUESTED,
        performedBy: session.user.id,
        metadata: JSON.stringify({
          signatoryName,
          signatoryEmail,
          signatureFieldId,
        }),
      },
    })

    return NextResponse.json(signature, { status: 201 })
  } catch (error) {
    console.error('Error creating signature request:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
