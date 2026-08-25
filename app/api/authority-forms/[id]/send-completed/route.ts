import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAuthorityFormPDF } from "@/lib/generate-authority-form-pdf";
import { sendSignedFormEmail } from "@/lib/email";
import { deliverEmailOnce } from "@/lib/email-delivery-ledger";
import { canonicalEmail } from "@/lib/email-identity";
import { createHash } from "node:crypto";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export function completedDeliveryResponse(sent: number, failed: number, total: number) {
  if (sent === 0) {
    return NextResponse.json(
      { success: false, state: "DELIVERY_FAILED_OR_UNRESOLVED", sent, failed, total },
      { status: 502 },
    );
  }
  if (failed > 0) {
    return NextResponse.json(
      { success: false, partial: true, state: "PARTIALLY_DELIVERED", sent, failed, total },
      // 5xx makes the outer request reservation retryable. Recipient-level
      // delivery identities replay confirmed sends and retry only known failures.
      { status: 503 },
    );
  }
  return NextResponse.json({ success: true, state: "DELIVERED", sent, failed, total });
}

/**
 * POST /api/authority-forms/:id/send-completed
 * Generate signed PDF and email it to all signatories
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: formId } = await params;

  // RA-1266: prevents sending the signed-form email twice to all
  // signatories when the admin double-clicks.
  return withIdempotency(request, userId, async () => {
    try {
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
      });

      if (!form) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Form not found",
          status: 404,
        });
      }

      // Check permissions
      if (
        form.report.userId !== userId &&
        form.report.assignedManagerId !== userId &&
        form.report.assignedAdminId !== userId
      ) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      // Collect recipients (signatories with email who have signed)
      const recipients = form.signatures.filter(
        (sig) => sig.signatoryEmail && sig.signedAt,
      );

      if (recipients.length === 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: "No signed signatories with email addresses",
          status: 400,
        });
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
      });

      // Convert to base64 for email attachment
      const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
      const pdfFilename = `${form.template.code}-${form.report.claimReferenceNumber || form.id.slice(-6)}-signed.pdf`;

      // Prepare signatories summary
      const signedSignatories = form.signatures
        .filter((s) => s.signedAt)
        .map((s) => ({
          name: s.signatoryName,
          role: s.signatoryRole,
          signedAt: s.signedAt!.toISOString(),
        }));

      // Send to each recipient. PDF generation already succeeded at this point,
      // so email failure must not propagate as a 500 — Promise.allSettled
      // captures individual outcomes. Each recipient has a durable message
      // identity, so an ambiguous provider response cannot cause a duplicate.
      const pdfHash = createHash("sha256").update(pdfBytes).digest("hex");
      const results = await Promise.allSettled(
        recipients.map((r) =>
          deliverEmailOnce({
            idempotencyKey: `authority-form:${form.id}:${canonicalEmail(r.signatoryEmail!)}:${pdfHash}`,
            kind: "AUTHORITY_FORM_COMPLETED",
            recipient: r.signatoryEmail!,
            payloadIdentity: `${form.id}|${r.id}|${pdfHash}`,
            send: () =>
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
                idempotencyKey: `authority-form:${form.id}:${canonicalEmail(r.signatoryEmail!)}:${pdfHash}`,
              }),
          }),
        ),
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      return completedDeliveryResponse(sent, failed, recipients.length);
    } catch (error: any) {
      console.error("[Send Completed] Error:", error);
      return fromException(request, error, { stage: "send-completed" });
    }
  });
}
