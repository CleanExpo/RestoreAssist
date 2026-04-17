import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const hdrs = await headers();
  const signature = hdrs.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // RA-913: Event deduplication — Stripe retries webhooks for up to 72h.
  // Record the event ID before processing; bail out silently if already seen.
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
    // P2002 = unique constraint violation — event already processed
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Mark as SKIPPED in the audit table for visibility
      await prisma.stripeWebhookEvent
        .updateMany({
          where: { stripeEventId: event.id },
          data: { status: "SKIPPED", processedAt: new Date() },
        })
        .catch(() => {});
      return NextResponse.json({ received: true });
    }
    // Any other DB error — still attempt processing (don't block on audit table)
    console.error("[Stripe] Failed to record webhook event:", event.id);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // RA-907: session.subscription is a string ID in checkout events.
        // Retrieve the full subscription to get the real current_period_end.
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription" && session.customer_email) {
          const subscriptionId = session.subscription;
          if (!subscriptionId || typeof subscriptionId !== "string") {
            console.error(
              "[Stripe] checkout.session.completed: no subscription ID on session",
              session.id,
            );
            break;
          }

          // Retrieve full subscription for accurate period end date
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);

          // RA-893: In Stripe SDK v19 / API 2025-10-29.clover, current_period_end
          // moved from Subscription top-level to SubscriptionItem level.
          const subscriptionEndsAt = new Date(
            (subscription.items.data[0]?.current_period_end ?? 0) * 1000,
          );

          await prisma.user.updateMany({
            where: { email: session.customer_email },
            data: {
              subscriptionStatus: "ACTIVE",
              stripeCustomerId: session.customer as string,
              subscriptionId: subscriptionId,
              subscriptionEndsAt,
              nextBillingDate: subscriptionEndsAt,
              creditsRemaining: 999999, // Unlimited for paid plans
            },
          });
        }
        break;
      }

      case "customer.subscription.created": {
        // RA-907: In SDK v19 / API 2025-10-29.clover, current_period_end lives on
        // the SubscriptionItem, not the Subscription root.
        const subscription = event.data.object as Stripe.Subscription;

        if (subscription.customer) {
          const subscriptionEndsAt = new Date(
            (subscription.items.data[0]?.current_period_end ?? 0) * 1000,
          );

          await prisma.user.updateMany({
            where: { stripeCustomerId: subscription.customer as string },
            data: {
              subscriptionStatus: "ACTIVE",
              subscriptionId: subscription.id,
              subscriptionEndsAt,
              nextBillingDate: subscriptionEndsAt,
              creditsRemaining: 999999,
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        // RA-907/RA-893: SDK v19 current_period_end is on items.data[0]
        const updatedSubscription = event.data.object as Stripe.Subscription;
        const updatedEndsAt = new Date(
          (updatedSubscription.items.data[0]?.current_period_end ?? 0) * 1000,
        );

        await prisma.user.updateMany({
          where: { subscriptionId: updatedSubscription.id },
          data: {
            subscriptionStatus:
              updatedSubscription.status === "active" ? "ACTIVE" : "CANCELED",
            subscriptionEndsAt: updatedEndsAt,
            nextBillingDate: updatedEndsAt,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const deletedSubscription = event.data.object as Stripe.Subscription;

        await prisma.user.updateMany({
          where: { subscriptionId: deletedSubscription.id },
          data: {
            subscriptionStatus: "EXPIRED",
            subscriptionEndsAt: new Date(),
            creditsRemaining: 0,
          },
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubscriptionId = (invoice as { subscription?: string })
          .subscription;

        if (invoiceSubscriptionId) {
          await prisma.user.updateMany({
            where: { subscriptionId: invoiceSubscriptionId },
            data: {
              lastBillingDate: new Date(),
              nextBillingDate: new Date(invoice.period_end * 1000),
              creditsRemaining: 999999,
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const failedInvoice = event.data.object as Stripe.Invoice;
        const failedSubscriptionId = (
          failedInvoice as { subscription?: string }
        ).subscription;

        if (failedSubscriptionId) {
          await prisma.user.updateMany({
            where: { subscriptionId: failedSubscriptionId },
            data: {
              subscriptionStatus: "PAST_DUE",
            },
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        // RA-893: Mark the RestoreAssist invoice PAID when Stripe confirms payment.
        // invoiceId is embedded in PaymentIntent metadata at checkout creation
        // (app/api/invoices/[id]/checkout/route.ts → payment_intent_data.metadata.invoiceId).
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const invoiceId = paymentIntent.metadata?.invoiceId;

        // RA-1139: Missing invoiceId → 400 so Stripe retries and ops are alerted.
        // (Previously was a silent break → 200, causing Stripe to stop retrying.)
        if (!invoiceId) {
          console.error(
            "[stripe-webhook] payment_intent.succeeded missing invoiceId metadata",
            {
              eventId: event.id,
              paymentIntentId: paymentIntent.id,
            },
          );
          return NextResponse.json(
            { error: "Missing invoiceId metadata" },
            { status: 400 },
          );
        }

        // Idempotency guard — don't double-update if already reconciled
        const existingInvoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { status: true },
        });

        // RA-1139: Orphaned invoiceId — Invoice row not found.
        // Return 200 to stop Stripe retrying (orphaned data won't self-heal),
        // but log critically so ops can investigate.
        if (!existingInvoice) {
          console.error(
            "[stripe-webhook] orphaned invoiceId — Invoice row not found",
            {
              eventId: event.id,
              invoiceId,
              paymentIntentId: paymentIntent.id,
            },
          );
          return NextResponse.json({
            received: true,
            warning: "orphaned_invoice_id",
          });
        }

        if (existingInvoice.status === "PAID") {
          break;
        }

        // Note: stripePaymentIntentId lives on InvoicePayment, not Invoice.
        // Record the core reconciliation state on the Invoice row directly.
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: "PAID",
            paidDate: new Date(),
            amountDue: 0,
          },
        });

        break;
      }

      default:
        // Unhandled event types are silently ignored
        break;
    }

    // Mark event as processed
    await prisma.stripeWebhookEvent
      .updateMany({
        where: { stripeEventId: event.id },
        data: { status: "COMPLETED", processedAt: new Date() },
      })
      .catch(() => {
        // Non-fatal — audit update failure doesn't block the response
      });

    return NextResponse.json({ received: true });
  } catch (error) {
    // Mark event as failed for retry visibility
    await prisma.stripeWebhookEvent
      .updateMany({
        where: { stripeEventId: event.id },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
