import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { reconcileInvoicePaymentIntent } from "@/lib/invoices/reconcile-stripe-payment-intent";
import { syncConnectAccountStatus } from "@/lib/billing/stripe-connect";

/**
 * P1-MNY-01 — Stripe Connect webhook: events from firms' connected accounts.
 *
 * A separate Stripe endpoint ("Events on Connected accounts") with its own
 * signing secret, STRIPE_CONNECT_WEBHOOK_SECRET. The platform endpoint's
 * secret is never accepted here, and every event must name the connected
 * account it came from (`event.account`).
 *
 *   account.updated           -> mirror charges_enabled / details_submitted
 *   payment_intent.succeeded  -> reconcile the invoice, but only when the
 *                                account is the invoice workspace's own
 *                                (otherwise 400 + audit row, invoice unpaid)
 *   charge.refunded,
 *   charge.dispute.*          -> logged only in v1 (the firm manages refunds
 *                                and disputes in its own Stripe Dashboard)
 *   anything else             -> acknowledged
 *
 * Deduplicated on the Stripe event id through StripeWebhookEvent, with the
 * same FAILED / stale-PENDING reprocess rule as the platform webhook.
 */
const STALE_PENDING_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return apiError(request, {
      code: "VALIDATION",
      message: "No signature",
      status: 400,
    });
  }

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return apiError(request, {
      code: "INTERNAL",
      message: "Connect webhook secret not configured",
      status: 500,
      stage: "stripe-connect-webhook:config",
    });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid signature",
      status: 400,
    });
  }

  const connectedAccountId = event.account;
  if (!connectedAccountId) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Not a connected-account event",
      status: 400,
    });
  }

  // Dedupe (RA-913 / RA-6962 rule, as the platform webhook).
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        eventData: JSON.stringify(event.data.object),
        status: "PENDING",
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "P2002") {
      const existing = await prisma.stripeWebhookEvent
        .findUnique({
          where: { stripeEventId: event.id },
          select: { status: true, createdAt: true },
        })
        .catch(() => null);
      const stalePending =
        existing?.status === "PENDING" &&
        Date.now() - existing.createdAt.getTime() > STALE_PENDING_MS;
      if (existing?.status !== "FAILED" && !stalePending) {
        return NextResponse.json({ received: true });
      }
      await prisma.stripeWebhookEvent
        .updateMany({
          where: { stripeEventId: event.id },
          data: { status: "PENDING", errorMessage: null },
        })
        .catch(() => {});
    } else {
      console.error("[stripe-connect-webhook] failed to record event:", event.id);
    }
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        // The event's account and the object must agree; trust neither alone.
        if (account.id === connectedAccountId) {
          await syncConnectAccountStatus(account);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const result = await reconcileInvoicePaymentIntent(event, paymentIntent, {
          connectedAccountId,
        });
        if (result.kind === "missing-invoice-id") {
          await markEvent(event.id, "FAILED", "Missing invoiceId metadata");
          return apiError(request, {
            code: "VALIDATION",
            message: "Missing invoiceId metadata",
            status: 400,
          });
        }
        if (result.kind === "account-mismatch") {
          await markEvent(
            event.id,
            "FAILED",
            `Connected account ${connectedAccountId} does not own invoice ${result.invoiceId}`,
          );
          return apiError(request, {
            code: "VALIDATION",
            message: "Payment account does not match the invoice's business",
            status: 400,
          });
        }
        if (result.kind === "orphan") {
          return NextResponse.json({ received: true, warning: "orphaned_invoice_id" });
        }
        break;
      }

      case "charge.refunded":
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const obj = event.data.object as { id?: string };
        console.warn("[stripe-connect-webhook] refund/dispute on a connected account (audit only)", {
          eventId: event.id,
          type: event.type,
          account: connectedAccountId,
          objectId: obj?.id ?? null,
        });
        break;
      }

      default:
        break;
    }

    await markEvent(event.id, "COMPLETED");
    return NextResponse.json({ received: true });
  } catch (processingError) {
    await markEvent(
      event.id,
      "FAILED",
      processingError instanceof Error ? processingError.message : "Unknown error",
    );
    return apiError(request, {
      code: "INTERNAL",
      message: "Webhook processing failed",
      status: 500,
      err: processingError,
      stage: "stripe-connect-webhook:processing",
      context: { stripeEventId: event.id, eventType: event.type },
    });
  }
}

async function markEvent(
  stripeEventId: string,
  status: "COMPLETED" | "FAILED",
  errorMessage?: string,
) {
  await prisma.stripeWebhookEvent
    .updateMany({
      where: { stripeEventId },
      data: {
        status,
        processedAt: new Date(),
        ...(errorMessage ? { errorMessage } : {}),
      },
    })
    .catch((err) => {
      console.error(
        `[stripe-connect-webhook] audit update failed for ${stripeEventId}:`,
        err instanceof Error ? err.message : err,
      );
    });
}
