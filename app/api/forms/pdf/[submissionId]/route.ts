import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { generateFormPDF } from '@/lib/forms/pdf-generator'
import { populateFromSubmission } from '@/lib/forms/auto-populate'

/**
 * GET /api/forms/pdf/[submissionId]
 * Generate and download PDF for a form submission
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get submission
    const submission = await prisma.formSubmission.findUnique({
      where: { id: params.submissionId },
      include: {
        template: true,
        signatures: true,
        user: true,
      },
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Verify ownership
    if (submission.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse form schema
    const formSchema =
      typeof submission.template.formSchema === 'string'
        ? JSON.parse(submission.template.formSchema)
        : submission.template.formSchema

    // Get auto-populated form data
    const populatedData = await populateFromSubmission(params.submissionId)

    // Merge with submission data (submission data takes precedence)
    const finalFormData = {
      ...populatedData,
      ...submission.formData,
    }

    // Generate PDF
    const pdfBuffer = await generateFormPDF(formSchema, finalFormData, {
      title: submission.template.name,
      includeWatermark: submission.status === 'DRAFT',
      watermarkText: submission.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED',
      includeSignatures: submission.signatures.length > 0,
      includeSubmissionDate: true,
      includePageNumbers: true,
    })

    // Return PDF as download
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${submission.template.name.replace(/\s+/g, '_')}_${submission.submissionNumber}.pdf"`,
        'Content-Length': pdfBuffer.length,
      },
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forms/pdf/[submissionId]
 * Generate PDF and save to database/storage
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get submission
    const submission = await prisma.formSubmission.findUnique({
      where: { id: params.submissionId },
      include: {
        template: true,
        signatures: true,
      },
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Verify ownership
    if (submission.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse form schema
    const formSchema =
      typeof submission.template.formSchema === 'string'
        ? JSON.parse(submission.template.formSchema)
        : submission.template.formSchema

    // Get auto-populated form data
    const populatedData = await populateFromSubmission(params.submissionId)
    const finalFormData = {
      ...populatedData,
      ...submission.formData,
    }

    // Generate PDF
    const pdfBuffer = await generateFormPDF(formSchema, finalFormData, {
      title: submission.template.name,
      includeWatermark: submission.status === 'DRAFT',
      watermarkText: submission.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED',
      includeSignatures: submission.signatures.length > 0,
      includeSubmissionDate: true,
      includePageNumbers: true,
    })

    // In production, you would upload to Cloudinary or S3
    // For now, return the PDF bytes and metadata
    return NextResponse.json(
      {
        success: true,
        message: 'PDF generated successfully',
        fileName: `${submission.template.name.replace(/\s+/g, '_')}_${submission.submissionNumber}.pdf`,
        size: pdfBuffer.length,
        url: `/api/forms/pdf/${params.submissionId}?download=true`,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
