import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateAuthorityFormPDF } from "@/lib/generate-authority-form-pdf"

/**
 * GET /api/authority-forms/:id/pdf
 * Generate and download authority form PDF
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: formId } = await params
    const { searchParams } = new URL(request.url)
    const draft = searchParams.get("draft") === "true"

    // Fetch form with all data
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: {
        template: true,
        signatures: {
          orderBy: { createdAt: "asc" }
        },
        report: {
          select: {
            id: true,
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
            claimReferenceNumber: true
          }
        }
      }
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Check permissions
    if (
      form.report.userId !== session.user.id &&
      form.report.assignedManagerId !== session.user.id &&
      form.report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Prepare signature data
    const signatures = form.signatures.map(sig => ({
      signatoryName: sig.signatoryName,
      signatoryRole: sig.signatoryRole,
      signatureData: draft ? null : sig.signatureData, // Don't include signatures in draft
      signedAt: sig.signedAt,
      signatoryEmail: sig.signatoryEmail
    }))

    // Generate PDF
    const pdfBytes = await generateAuthorityFormPDF({
      companyName: form.companyName,
      companyLogo: form.companyLogo,
      companyABN: form.companyABN,
      companyPhone: form.companyPhone,
      companyEmail: form.companyEmail,
      companyWebsite: form.companyWebsite,
      companyAddress: form.companyAddress,
      clientName: form.clientName,
      clientAddress: form.clientAddress,
      incidentDate: form.incidentDate,
      incidentBrief: form.incidentBrief,
      claimReferenceNumber: form.report.claimReferenceNumber,
      formName: form.template.name,
      authorityDescription: form.authorityDescription,
      date: new Date(),
      signatures
    })

    // Return PDF
    const filename = `${form.template.code}-${form.report.claimReferenceNumber || form.id.slice(-6)}.pdf`
    
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString()
      }
    })
  } catch (error) {
    console.error("Error generating authority form PDF:", error)
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    )
  }
}
