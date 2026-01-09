/**
 * Multi-Stakeholder PDF Generator API
 * POST /api/forms/pdf/multi-stakeholder
 *
 * Generates three separate PDF variants for different stakeholders:
 * - Insurance/Adjuster (technical details)
 * - Client/Property Owner (simplified)
 * - Internal/Technician (operational, profit margins)
 *
 * Requires: Premium Inspection Reports subscription ($49/month)
 */

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { requirePremiumInspectionReports } from '@/lib/premium-inspection-access'
import { generateAustralianInspectionPDFs, generateSingleInspectionPDF } from '@/lib/pdf'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'NOT_AUTHENTICATED' },
        { status: 401 }
      )
    }

    // Check premium subscription
    try {
      await requirePremiumInspectionReports(session.user.id)
    } catch (err) {
      return NextResponse.json(
        {
          error: 'Premium Inspection Reports subscription required',
          code: 'PREMIUM_REQUIRED',
          upgradeUrl: '/dashboard/subscriptions/inspection-reports',
        },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await req.json()
    const { formSubmissionId, variant } = body

    if (!formSubmissionId) {
      return NextResponse.json(
        { error: 'formSubmissionId is required', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Fetch form submission
    const formSubmission = await prisma.formSubmission.findUnique({
      where: { id: formSubmissionId },
      include: {
        formTemplate: true,
      },
    })

    if (!formSubmission) {
      return NextResponse.json(
        { error: 'Form submission not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (formSubmission.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Get user business info for PDF branding
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        businessName: true,
        businessAddress: true,
        businessPhone: true,
        businessEmail: true,
        businessABN: true,
        businessLogo: true,
      },
    })

    // Prepare PDF generation options
    const pdfOptions = {
      businessName: user?.businessName,
      businessAddress: user?.businessAddress,
      businessPhone: user?.businessPhone,
      businessEmail: user?.businessEmail,
      businessABN: user?.businessABN,
      businessLogo: user?.businessLogo || undefined,
      reportReference: formSubmissionId,
      reportDate: new Date(formSubmission.createdAt),
    }

    // If specific variant requested, generate only that
    if (variant && ['insurer', 'client', 'internal'].includes(variant)) {
      const pdfBuffer = await generateSingleInspectionPDF(
        {
          id: formSubmissionId,
          formTemplateId: formSubmission.formTemplateId,
          submissionData: formSubmission.submissionData as any,
          userId: session.user.id,
          createdAt: formSubmission.createdAt.toISOString(),
        },
        variant as 'insurer' | 'client' | 'internal',
        pdfOptions
      )

      if (!pdfBuffer) {
        return NextResponse.json(
          { error: 'Failed to generate PDF', code: 'PDF_GENERATION_ERROR' },
          { status: 500 }
        )
      }

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${variant}-inspection-report-${formSubmissionId}.pdf"`,
        },
      })
    }

    // Generate all three PDFs
    const result = await generateAustralianInspectionPDFs(
      {
        id: formSubmissionId,
        formTemplateId: formSubmission.formTemplateId,
        submissionData: formSubmission.submissionData as any,
        userId: session.user.id,
        createdAt: formSubmission.createdAt.toISOString(),
      },
      pdfOptions
    )

    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.message || 'Failed to generate PDFs', code: 'PDF_GENERATION_ERROR' },
        { status: 500 }
      )
    }

    // For now, return the PDF buffers
    // TODO: Upload to Cloudinary and return URLs
    return NextResponse.json({
      status: 'success',
      message: 'PDFs generated successfully',
      formSubmissionId,
      pdfs: {
        insurer: {
          name: 'Insurance Adjuster Report',
          size: result.insurerPdfBuffer?.length || 0,
          timestamp: result.generatedAt,
        },
        client: {
          name: 'Client Report',
          size: result.clientPdfBuffer?.length || 0,
          timestamp: result.generatedAt,
        },
        internal: {
          name: 'Internal Job Sheet',
          size: result.internalPdfBuffer?.length || 0,
          timestamp: result.generatedAt,
        },
      },
      // TODO: Add Cloudinary URLs when upload is implemented
      // insurerPdfUrl: '...',
      // clientPdfUrl: '...',
      // internalPdfUrl: '...',
    })
  } catch (error) {
    console.error('Error in multi-stakeholder PDF endpoint:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      message: 'Use POST to generate multi-stakeholder PDFs',
      method: 'POST',
      body: {
        formSubmissionId: 'required string',
        variant: 'optional - insurer|client|internal for single PDF',
      },
    },
    { status: 200 }
  )
}
