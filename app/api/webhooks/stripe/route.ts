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

  try {
    // RA-913: Idempotency — skip events already successfully processed
    const existingEvent = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { status: true },
    });
    if (existingEvent?.status === "COMPLETED") {
      return NextResponse.json({ received: true });
    }

    // Record the event before processing (upsert handles Stripe retries)
    await prisma.stripeWebhookEvent.upsert({
      where: { stripeEventId: event.id },
      create: {
        stripeEventId: event.id,
        eventType: event.type,
        eventData: JSON.stringify(event.data.object),
        status: "PROCESSING",
      },
      update: {
        status: "PROCESSING",
        retryCount: { increment: 1 },
      },
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription" && session.customer_email) {
          // RA-907: Use actual subscription period end instead of hardcoded +30 days
          let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(
                session.subscription as string,
              );
              const periodEndTs = (sub as any).current_period_end as
                | number
                | undefined;
              if (periodEndTs) {
                periodEnd = new Date(periodEndTs * 1000);
              }
            } catch {
              // Fall through to +30 day default if retrieval fails
            }
          }

          await prisma.user.updateMany({
            where: { email: session.customer_email },
            data: {
              subscriptionStatus: "ACTIVE",
              stripeCustomerId: session.customer as string,
              subscriptionId: session.subscription as string,
              subscriptionEndsAt: periodEnd,
              nextBillingDate: periodEnd,
              creditsRemaining: 999999, // Unlimited for paid plans
            },
          });
        }
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;

        if (subscription.customer) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: subscription.customer as string },
            data: {
              subscriptionStatus: "ACTIVE",
              subscriptionId: subscription.id,
              subscriptionEndsAt: new Date(
                ((subscription as any).current_period_end ??
                  Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000,
              ),
              nextBillingDate: new Date(
                ((subscription as any).current_period_end ??
                  Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000,
              ),
              creditsRemaining: 999999,
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const updatedSubscription = event.data.object as Stripe.Subscription;

        await prisma.user.updateMany({
          where: { subscriptionId: updatedSubscription.id },
          data: {
            subscriptionStatus:
              updatedSubscription.status === "active" ? "ACTIVE" : "CANCELED",
            subscriptionEndsAt: new Date(
              ((updatedSubscription as any).current_period_end ??
                Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000,
            ),
            nextBillingDate: new Date(
              ((updatedSubscription as any).current_period_end ??
                Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000,
            ),
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

        if ((invoice as any).subscription) {
          await prisma.user.updateMany({
            where: { subscriptionId: (invoice as any).subscription as string },
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

        if ((failedInvoice as any).subscription) {
          await prisma.user.updateMany({
            where: {
              subscriptionId: (failedInvoice as any).subscription as string,
            },
            data: {
              subscriptionStatus: "PAST_DUE",
            },
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        // RA-893: Mark Invoice as PAID when a one-off payment intent succeeds
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.id) {
          const payment = await prisma.invoicePayment.findUnique({
            where: { stripePaymentIntentId: pi.id },
            select: { invoiceId: true },
          });
          if (payment?.invoiceId) {
            await prisma.invoice.update({
              where: { id: payment.invoiceId },
              data: {
                status: "PAID",
                paidDate: new Date(),
                amountPaid: pi.amount_received,
                amountDue: 0,
              },
            });
          }
        }
        break;
      }

      default:
        // Unhandled event types are silently ignored
        break;
    }

    // RA-913: Mark event as successfully completed
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { status: "COMPLETED", processedAt: new Date() },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    // RA-913: Record failure for retry tracking and alerting
    try {
      await prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      });
    } catch {
      // Ignore secondary failure — primary error response takes precedence
    }
    console.error("[stripe-webhook] Processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
