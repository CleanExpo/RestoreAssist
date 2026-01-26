import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateAuthorityFormPDF } from "@/lib/generate-authority-form-pdf"
import { sendSignedFormEmail } from "@/lib/email"

/**
 * POST /api/authority-forms/:id/send-completed
 * Generate signed PDF and email it to all signatories
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: formId } = await params

    // Fetch form with all data
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: {
        template: true,
        signatures: { orderBy: { createdAt: "asc" } },
        report: {
          select: {
            id: true,
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
            claimReferenceNumber: true,
          },
        },
      },
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

    // Collect recipients (signatories with email who have signed)
    const recipients = form.signatures.filter(
      (sig) => sig.signatoryEmail && sig.signedAt
    )

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No signed signatories with email addresses" },
        { status: 400 }
      )
    }

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
      signatures: form.signatures.map((sig) => ({
        signatoryName: sig.signatoryName,
        signatoryRole: sig.signatoryRole,
        signatureData: sig.signatureData,
        signedAt: sig.signedAt,
      })),
    })

    // Convert to base64 for email attachment
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64")
    const pdfFilename = `${form.template.code}-${form.report.claimReferenceNumber || form.id.slice(-6)}-signed.pdf`

    // Prepare signatories summary
    const signedSignatories = form.signatures
      .filter((s) => s.signedAt)
      .map((s) => ({
        name: s.signatoryName,
        role: s.signatoryRole,
        signedAt: s.signedAt!.toISOString(),
      }))

    // Send to each recipient
    const results = await Promise.allSettled(
      recipients.map((r) =>
        sendSignedFormEmail({
          recipientEmail: r.signatoryEmail!,
          recipientName: r.signatoryName,
          formName: form.template.name,
          clientName: form.clientName,
          clientAddress: form.clientAddress,
          companyName: form.companyName,
          signatories: signedSignatories,
          pdfBase64,
          pdfFilename,
        })
      )
    )

    const sent = results.filter((r) => r.status === "fulfilled").length
    const failed = results.filter((r) => r.status === "rejected").length

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: recipients.length,
    })
  } catch (error: any) {
    console.error("[Send Completed] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send completed form emails" },
      { status: 500 }
    )
  }
}
