import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { withIdempotency } from "@/lib/idempotency";
import {
  formAcceptsSignatureWhere,
  formSignatureRefusal,
  unsignedSlotWhere,
} from "@/lib/authority-forms/signed-record-guard";
import { apiError, fromException } from "@/lib/api-errors";
import { escapeHtml, getFromEmail } from "@/lib/email";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import {
  SIGNING_LINK_TTL_DAYS,
  unchangedSlotWhere,
} from "@/lib/authority-forms/signing-link";

/**
 * POST /api/authority-forms/:id/send-signature-request
 * Send a signature request email to a signatory
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

  // RA-1266: prevent sending duplicate signature-request emails on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { signatureId } = body;

      if (!signatureId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "signatureId is required",
          status: 400,
        });
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
      });

      if (!form) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Form not found",
          status: 404,
        });
      }

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

      // RA-8400: a cancelled or completed form issues no signing link.
      const closedRefusal = formSignatureRefusal(form);
      if (closedRefusal) {
        return apiError(request, {
          code: "CONFLICT",
          message: closedRefusal,
          status: 409,
        });
      }

      // Get the signature record — scope by instanceId (matches formId
      // from the URL). signatureId is client-supplied; without this guard
      // a caller who owns formId could pass a foreign signatureId and
      // trigger a signature-request email (and token mutation) for a
      // signature belonging to another tenant's form.
      const signature = await prisma.authorityFormSignature.findFirst({
        where: { id: signatureId, instanceId: formId },
      });

      if (!signature) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Signature not found",
          status: 404,
        });
      }

      if (!signature.signatoryEmail) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Signatory has no email address",
          status: 400,
        });
      }

      if (signature.signedAt) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Already signed",
          status: 400,
        });
      }

      // Generate token
      const token = randomUUID();

      // Update signature record — same instanceId scope as the read above,
      // so a signature deleted/reassigned between the two calls can't be
      // mutated either.
      const updateResult = await prisma.authorityFormSignature.updateMany({
        // RA-8400: only an unsigned slot on a form that still accepts
        // signatures gets a token.
        where: {
          id: signatureId,
          instanceId: formId,
          ...unsignedSlotWhere(),
          // RA-8589: the slot must still hold the email and token read above.
          // A staff correction or cancellation that landed in between leaves
          // this write matching nothing, so no live link goes to the old
          // address and a cancelled link is not revived.
          ...unchangedSlotWhere(signature),
          instance: formAcceptsSignatureWhere(),
        },
        data: {
          signatureRequestToken: token,
          signatureRequestSent: true,
          signatureRequestSentAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        // The row is gone (404), or it changed between the read and the write
        // (409): the caller re-reads and sends again.
        const stillThere = await prisma.authorityFormSignature.findFirst({
          where: { id: signatureId, instanceId: formId },
          select: { id: true },
        });
        if (stillThere) {
          return apiError(request, {
            code: "CONFLICT",
            message:
              "This signatory or form was changed while the request was being sent. Check the details and send again.",
            status: 409,
          });
        }
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Signature not found",
          status: 404,
        });
      }

      // Update form status. Conditional on DRAFT in the write itself, so a
      // cancellation landing after the read cannot be reopened (RA-8400).
      if (form.status === "DRAFT") {
        await prisma.authorityFormInstance.updateMany({
          where: { id: formId, status: "DRAFT" },
          data: { status: "PENDING_SIGNATURES" },
        });
      }

      // Build signing URL
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3008";
      const signingUrl = `${baseUrl}/sign/${token}`;

      if (!isEmailServiceConfigured()) {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: "Email service is not configured.",
          status: 503,
        });
      }

      const sendResult = await sendTransactionalEmail({
        from: getFromEmail(),
        to: signature.signatoryEmail,
        subject: `Signature Required: ${form.template.name} — ${form.clientName}`,
        html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${escapeHtml(form.companyName)}</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Signature Request</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Hello ${escapeHtml(signature.signatoryName)},</p>
            <p>You have been requested to sign the following authority form:</p>
            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0 0 8px;"><strong>Form:</strong> ${escapeHtml(form.template.name)}</p>
              <p style="margin: 0 0 8px;"><strong>Client:</strong> ${escapeHtml(form.clientName)}</p>
              <p style="margin: 0;"><strong>Address:</strong> ${escapeHtml(form.clientAddress)}</p>
            </div>
            <p>Please click the button below to review and sign the form:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${signingUrl}" style="display: inline-block; padding: 12px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Review & Sign Form
              </a>
            </div>
            <p style="font-size: 13px; color: #6b7280;">This link is unique to you. It stops working once signed, or ${SIGNING_LINK_TTL_DAYS} days after this email was sent. If you did not expect this request, please disregard this email.</p>
          </div>
        </body>
        </html>
      `,
      });
      if (sendResult.error) {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: "Failed to send signature request email.",
          status: 503,
          err: sendResult.error,
          stage: "send-signature-request",
        });
      }

      return NextResponse.json({ success: true, token });
    } catch (error: any) {
      console.error("[Send Signature Request] Error:", error);
      return fromException(request, error, { stage: "send-signature-request" });
    }
  });
}
