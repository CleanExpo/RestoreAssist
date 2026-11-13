import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { isDraft, isCancelled } from "@/lib/invoice-status";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import {
  INVOICE_ONLINE_PAYMENT_UNAVAILABLE_MESSAGE,
  isInvoiceOnlinePaymentEnabled,
} from "@/lib/invoices/online-payment";
import {
  ONLINE_PAYMENT_REASON_MESSAGES,
  getInvoiceOnlinePayment,
} from "@/lib/invoices/online-payment-availability";

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.app";

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
  // P1-MNY-00 / P1-MNY-01: off unless INVOICE_ONLINE_PAYMENT_ENABLED is
  // exactly "true". Refuse before any Stripe call.
  if (!isInvoiceOnlinePaymentEnabled()) {
    return apiError(request, {
      code: "FEATURE_UNAVAILABLE",
      message: INVOICE_ONLINE_PAYMENT_UNAVAILABLE_MESSAGE,
      status: 409,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: Idempotency-Key prevents creating duplicate Stripe checkout
  // sessions when a client retries — each session.create is a billable
  // Stripe API call and leaves stranded session objects on the account.
  return withIdempotency(request, userId, async () => {
    try {
      // Check if invoice exists and belongs to user
      const invoice = await prisma.invoice.findUnique({
        where: {
          id,
          userId,
        },
        include: {
          // Only parent scalars are read below; lineItems are minimally
          // selected to keep the relation contract explicit (CLAUDE.md rule 4).
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: { id: true },
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

      // Can't create checkout for draft or fully paid invoices
      if (isDraft(invoice.status)) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Cannot create checkout for draft invoices. Please send the invoice first.",
          status: 400,
        });
      }

      if (invoice.status === "PAID" || invoice.amountDue <= 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: "This invoice has already been paid",
          status: 400,
        });
      }

      if (isCancelled(invoice.status)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Cannot create checkout for cancelled invoices",
          status: 400,
        });
      }

      // P1-MNY-01: the money must go to the firm. Only the invoice's own
      // workspace counts, and it needs the PAYMENTS add-on and a connected
      // Stripe account with charges enabled.
      const onlinePayment = await getInvoiceOnlinePayment(invoice);
      if (!onlinePayment.available) {
        return apiError(request, {
          code: "FEATURE_UNAVAILABLE",
          message: ONLINE_PAYMENT_REASON_MESSAGES[onlinePayment.reason],
          status: 409,
        });
      }

      // Direct charge on the firm's connected account ({ stripeAccount }),
      // with no application fee: RestoreAssist takes nothing from it.
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: invoice.customerEmail,
        line_items: [
          {
            price_data: {
              currency: invoice.currency.toLowerCase(),
              unit_amount: invoice.amountDue, // Already in cents
              product_data: {
                name: `Invoice ${invoice.invoiceNumber}`,
                description: `Payment for invoice ${invoice.invoiceNumber} - ${invoice.customerName}`,
                metadata: {
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                },
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "invoice",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          userId,
          workspaceId: onlinePayment.workspaceId,
        },
        success_url: `${APP_URL}/dashboard/invoices/${invoice.id}?payment=success`,
        cancel_url: `${APP_URL}/dashboard/invoices/${invoice.id}?payment=cancelled`,
        payment_intent_data: {
          metadata: {
            type: "invoice",
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            userId,
            workspaceId: onlinePayment.workspaceId,
          },
        },
      }, { stripeAccount: onlinePayment.stripeAccountId });

      // Create audit log
      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: id,
          userId,
          action: "checkout_created",
          description: `Stripe checkout session created for online payment`,
          metadata: {
            sessionId: checkoutSession.id,
            amount: invoice.amountDue,
            connectedAccountId: onlinePayment.stripeAccountId,
          },
        },
      });

      return NextResponse.json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
      });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      return fromException(request, error, { stage: "checkout" });
    }
  });
}
