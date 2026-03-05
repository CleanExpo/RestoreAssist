import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { Resend } from "resend"

let resend: Resend | null = null
function getResendClient(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured")
    }
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

/**
 * POST /api/authority-forms/:id/send-signature-request
 * Send a signature request email to a signatory
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
    const body = await request.json()
    const { signatureId } = body

    if (!signatureId) {
      return NextResponse.json({ error: "signatureId is required" }, { status: 400 })
    }

    // Verify form and permissions
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: {
        template: { select: { name: true } },
        report: {
          select: {
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
          },
        },
      },
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    if (
      form.report.userId !== session.user.id &&
      form.report.assignedManagerId !== session.user.id &&
      form.report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get the signature record
    const signature = await prisma.authorityFormSignature.findUnique({
      where: { id: signatureId },
    })

    if (!signature) {
      return NextResponse.json({ error: "Signature not found" }, { status: 404 })
    }

    if (!signature.signatoryEmail) {
      return NextResponse.json({ error: "Signatory has no email address" }, { status: 400 })
    }

    if (signature.signedAt) {
      return NextResponse.json({ error: "Already signed" }, { status: 400 })
    }

    // Generate token
    const token = randomUUID()

    // Update signature record
    await prisma.authorityFormSignature.update({
      where: { id: signatureId },
      data: {
        signatureRequestToken: token,
        signatureRequestSent: true,
        signatureRequestSentAt: new Date(),
      },
    })

    // Update form status
    if (form.status === "DRAFT") {
      await prisma.authorityFormInstance.update({
        where: { id: formId },
        data: { status: "PENDING_SIGNATURES" },
      })
    }

    // Build signing URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3008"
    const signingUrl = `${baseUrl}/sign/${token}`

    // Send email
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Restore Assist <onboarding@resend.dev>"

    await getResendClient().emails.send({
      from: fromEmail,
      to: signature.signatoryEmail,
      subject: `Signature Required: ${form.template.name} — ${form.clientName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${form.companyName}</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Signature Request</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Hello ${signature.signatoryName},</p>
            <p>You have been requested to sign the following authority form:</p>
            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0 0 8px;"><strong>Form:</strong> ${form.template.name}</p>
              <p style="margin: 0 0 8px;"><strong>Client:</strong> ${form.clientName}</p>
              <p style="margin: 0;"><strong>Address:</strong> ${form.clientAddress}</p>
            </div>
            <p>Please click the button below to review and sign the form:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${signingUrl}" style="display: inline-block; padding: 12px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Review & Sign Form
              </a>
            </div>
            <p style="font-size: 13px; color: #6b7280;">This link is unique to you and will expire once signed. If you did not expect this request, please disregard this email.</p>
          </div>
        </body>
        </html>
      `,
    })

    return NextResponse.json({ success: true, token })
  } catch (error: any) {
    console.error("[Send Signature Request] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send signature request" },
      { status: 500 }
    )
  }
}
