import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { generateInvoiceSentEmail } from "@/lib/invoices/email-templates";
import { isDraft } from "@/lib/invoice-status";
import { withIdempotency } from "@/lib/idempotency";
import { mintPublicToken } from "@/lib/invoices/public-token";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveResendConfig } from "@/lib/email/resolve-resend-config";
import { withEmailTimeout } from "@/lib/email";

function isResendConfigError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("api key") ||
    m.includes("unauthorized") ||
    m.includes("not configured") ||
    m.includes("from address") ||
    m.includes("domain is not verified")
  );
}

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

  // RA-1266: Idempotency-Key prevents sending the same invoice email twice
  // when a client retries — customer annoyance + delivery-reputation hit.
  return withIdempotency(request, userId, async () => {
    try {
      const { id } = await params;

      const invoice = await prisma.invoice.findUnique({
        where: {
          id,
          userId,
        },
        include: {
          // lineItems aren't read below — the email template uses parent
          // scalars only — selecting id keeps the relation contract explicit.
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          },
          user: {
            select: {
              name: true,
              email: true,
              businessName: true,
              businessEmail: true,
              businessPhone: true,
              organizationId: true,
            },
          },
        },
      });

      if (!invoice) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Invoice not found",
          status: 404,
        });
      }

      // Allow send from DRAFT (first send) or SENT (resend)
      if (!isDraft(invoice.status) && invoice.status !== "SENT") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invoice cannot be sent in current status",
          status: 400,
        });
      }

      const resendConfig = await resolveResendConfig(
        invoice.user.organizationId,
      );
      if (!resendConfig?.apiKey?.trim()) {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message:
            "Email service not configured. Set RESEND_API_KEY (and RESEND_FROM_EMAIL) or connect a Resend key in Integrations.",
          status: 503,
        });
      }

      // RA-1596 — mint a high-entropy token + 90-day expiry on first
      // send. Previously `inv_${invoice.id}_${Date.now()}` which was
      // predictable and had no expiry. We re-use the existing token
      // only if it's still present AND hasn't expired; otherwise we
      // rotate so a leaked old link can't be resurrected.
      const now = Date.now();
      const existingValid =
        invoice.publicToken &&
        (!(invoice as any).publicTokenExpiresAt ||
          new Date((invoice as any).publicTokenExpiresAt).getTime() > now);
      let publicToken = invoice.publicToken ?? "";
      let newExpiresAt: Date | undefined;
      let newRotatedAt: Date | undefined;
      if (!existingValid) {
        const minted = mintPublicToken();
        publicToken = minted.token;
        newExpiresAt = minted.expiresAt;
        newRotatedAt = minted.rotatedAt;
      }

      const displayName =
        invoice.user.businessName || invoice.user.name || "RestoreAssist";
      const replyTo =
        invoice.user.businessEmail || invoice.user.email || undefined;

      // Always send from the verified Resend "from" address. Using the
      // technician's personal/business mailbox as `from` fails delivery
      // unless that domain is verified on the Resend account.
      const fromAddress = resendConfig.from;

      const emailHtml = generateInvoiceSentEmail({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalIncGST: invoice.totalIncGST,
        amountDue: invoice.amountDue,
        customerName: invoice.customerName,
        publicToken,
        businessName: displayName,
        businessEmail: invoice.user.businessEmail || undefined,
        businessPhone: invoice.user.businessPhone || undefined,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://restoreassist.app",
      });

      const resend = new Resend(resendConfig.apiKey.trim());

      try {
        const { data: emailData, error: emailError } = await withEmailTimeout(
          resend.emails.send({
            from: fromAddress,
            to: invoice.customerEmail,
            subject: `Invoice ${invoice.invoiceNumber} from ${displayName}`,
            html: emailHtml,
            ...(replyTo ? { replyTo } : {}),
          }),
        );

        if (emailError) {
          const message = emailError.message || "Email provider rejected the send";
          console.error("Email send error:", emailError);
          return apiError(request, {
            code: "UPSTREAM_FAILED",
            message: isResendConfigError(message)
              ? "Email service misconfigured — check RESEND_API_KEY and RESEND_FROM_EMAIL (verified domain)."
              : "Failed to send invoice email. Please try again shortly.",
            status: 503,
            err: emailError,
            stage: "send-email",
          });
        }

        // Update invoice in transaction
        await prisma.$transaction([
          prisma.invoice.update({
            where: { id, userId },
            data: {
              status: "SENT",
              sentDate: new Date(),
              publicToken,
              ...(newExpiresAt
                ? {
                    publicTokenExpiresAt: newExpiresAt,
                    publicTokenRotatedAt: newRotatedAt,
                  }
                : {}),
            } as any,
          }),
          prisma.invoiceEmail.create({
            data: {
              invoiceId: id,
              emailType: "SENT",
              recipientEmail: invoice.customerEmail,
              subject: `Invoice ${invoice.invoiceNumber}`,
              resendEmailId: emailData?.id,
            },
          }),
          prisma.invoiceAuditLog.create({
            data: {
              invoiceId: id,
              userId,
              action: "sent",
              description: `Invoice sent to ${invoice.customerEmail}`,
            },
          }),
        ]);

        return NextResponse.json({
          success: true,
          message: "Invoice sent successfully",
          emailId: emailData?.id,
        });
      } catch (emailError: unknown) {
        // RA-786: do not leak raw provider messages to clients
        console.error("Email send error:", emailError);
        const raw =
          emailError instanceof Error ? emailError.message : String(emailError);
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: isResendConfigError(raw)
            ? "Email service misconfigured — check RESEND_API_KEY and RESEND_FROM_EMAIL (verified domain)."
            : "Failed to send invoice email. Please try again shortly.",
          status: 503,
          err: emailError,
          stage: "send-email",
        });
      }
    } catch (error: unknown) {
      console.error("Error sending invoice:", error);
      return fromException(request, error, { stage: "send" });
    }
  });
}
