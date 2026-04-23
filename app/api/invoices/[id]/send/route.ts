import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { generateInvoiceSentEmail } from "@/lib/invoices/email-templates";
import { isDraft } from "@/lib/invoice-status";
import { withIdempotency } from "@/lib/idempotency";
import { mintPublicToken } from "@/lib/invoices/public-token";

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // RA-1266: Idempotency-Key prevents sending the same invoice email twice
  // when a client retries — customer annoyance + delivery-reputation hit.
  return withIdempotency(request, userId, async () => {
    try {
      if (!resend) {
        return NextResponse.json(
          {
            error:
              "Email service not configured. Please set RESEND_API_KEY environment variable.",
          },
          { status: 503 },
        );
      }

      const { id } = await params;

      const invoice = await prisma.invoice.findUnique({
        where: {
          id,
          userId,
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: "asc" },
          },
          user: {
            select: {
              name: true,
              email: true,
              businessName: true,
              businessEmail: true,
              businessPhone: true,
            },
          },
        },
      });

      if (!invoice) {
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 },
        );
      }

      // Allow send from DRAFT (first send) or SENT (resend)
      if (!isDraft(invoice.status) && invoice.status !== "SENT") {
        return NextResponse.json(
          { error: "Invoice cannot be sent in current status" },
          { status: 400 },
        );
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

      // Send email via Resend
      const fromEmail =
        invoice.user.businessEmail ||
        invoice.user.email ||
        "invoices@restoreassist.app";
      const fromName =
        invoice.user.businessName || invoice.user.name || "RestoreAssist";

      // Generate professional email HTML
      const emailHtml = generateInvoiceSentEmail({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalIncGST: invoice.totalIncGST,
        amountDue: invoice.amountDue,
        customerName: invoice.customerName,
        publicToken,
        businessName: fromName,
        businessEmail: invoice.user.businessEmail || undefined,
        businessPhone: invoice.user.businessPhone || undefined,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://restoreassist.app",
      });

      try {
        const { data: emailData, error: emailError } = await resend.emails.send(
          {
            from: `${fromName} <${fromEmail}>`,
            to: invoice.customerEmail,
            subject: `Invoice ${invoice.invoiceNumber} from ${fromName}`,
            html: emailHtml,
            replyTo: invoice.user.businessEmail || invoice.user.email,
          },
        );

        if (emailError) {
          throw new Error(`Email send failed: ${emailError.message}`);
        }

        // Update invoice in transaction
        const updatedInvoice = await prisma.$transaction([
          prisma.invoice.update({
            where: { id },
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
      } catch (emailError: any) {
        // RA-786: do not leak emailError.message to clients
        console.error("Email send error:", emailError);
        return NextResponse.json(
          { error: "Failed to send email" },
          { status: 500 },
        );
      }
    } catch (error: any) {
      console.error("Error sending invoice:", error);
      return NextResponse.json(
        { error: "Failed to send invoice" },
        { status: 500 },
      );
    }
  });
}
