import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import Stripe from "stripe";
import { SubscriptionStatus } from "@prisma/client";
import { sendSubscriptionActivatedEmail } from "@/lib/email";
import { warnIfZeroRows } from "@/lib/prisma-assert";

/**
 * Best-effort human-readable plan name from a Stripe Subscription.
 * Prefers the Product name (e.g. "Monthly Plan - 50 Reports") embedded in
 * the first SubscriptionItem's price.product. Falls back to Price nickname,
 * then the recurring interval ("monthly" / "yearly"). Returns null if
 * Stripe hasn't expanded deep enough — caller should leave subscriptionPlan
 * untouched in that case.
 */
function derivePlanNameFromSubscription(
  subscription: Stripe.Subscription,
): string | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;
  const price = item.price;
  if (!price) return null;

  const product = price.product;
  if (product && typeof product === "object" && "name" in product) {
    return (product as Stripe.Product).name ?? null;
  }

  if (price.nickname) return price.nickname;

  const interval = price.recurring?.interval;
  if (interval === "month") return "Monthly Plan";
  if (interval === "year") return "Yearly Plan";
  return null;
}

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
      // Mark as SKIPPED in the audit table for visibility.
      // RA-1302 — log if the audit update itself fails so operators have
      // a trail; don't fail the webhook response (Stripe would retry and
      // trigger another round of P2002 duplicates).
      await prisma.stripeWebhookEvent
        .updateMany({
          where: { stripeEventId: event.id },
          data: { status: "SKIPPED", processedAt: new Date() },
        })
        .catch((auditErr) => {
          console.error(
            `[Stripe] Audit update FAILED for duplicate event ${event.id}:`,
            auditErr instanceof Error ? auditErr.message : auditErr,
          );
        });
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

        if (session.mode === "subscription") {
          const subscriptionId = session.subscription;
          if (!subscriptionId || typeof subscriptionId !== "string") {
            console.error(
              "[Stripe] checkout.session.completed: no subscription ID on session",
              session.id,
            );
            break;
          }

          // Prefer metadata.userId (set by /api/create-checkout-session).
          // Fall back to stripeCustomerId match then email for older sessions.
          // session.customer_email is frequently null when `customer:` is passed
          // to checkout.sessions.create — the previous keying silently no-op'd.
          const metadataUserId = session.metadata?.userId ?? null;
          const customerId =
            typeof session.customer === "string" ? session.customer : null;

          // Retrieve full subscription for accurate period end date
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);

          // RA-893: In Stripe SDK v19 / API 2025-10-29.clover, current_period_end
          // moved from Subscription top-level to SubscriptionItem level.
          const subscriptionEndsAt = new Date(
            (subscription.items.data[0]?.current_period_end ?? 0) * 1000,
          );

          // Derive subscriptionPlan from the Price/Product on the first item
          // so the UI has a human-readable plan name. Previously only written
          // by /api/verify-subscription; the webhook path left it NULL.
          const subscriptionPlan = derivePlanNameFromSubscription(subscription);

          const where = metadataUserId
            ? { id: metadataUserId }
            : customerId
              ? { stripeCustomerId: customerId }
              : session.customer_email
                ? { email: session.customer_email }
                : null;

          if (!where) {
            console.error(
              "[Stripe] checkout.session.completed: no identifier to match user",
              session.id,
            );
            break;
          }

          const activationResult = await prisma.user.updateMany({
            where,
            data: {
              subscriptionStatus: "ACTIVE",
              stripeCustomerId: customerId ?? undefined,
              subscriptionId: subscriptionId,
              subscriptionPlan: subscriptionPlan ?? undefined,
              subscriptionEndsAt,
              nextBillingDate: subscriptionEndsAt,
              creditsRemaining: 999999, // Unlimited for paid plans
            },
          });
          // RA-1306: if no user matched, log a loud error so ops can trace
          // the customer. Don't throw — the webhook still returns 200 so
          // Stripe doesn't retry a non-recoverable "user not found" case.
          warnIfZeroRows(activationResult, "stripe.checkout.completed.activate", {
            customerId,
            subscriptionId,
            where,
          });

          // RA-1261: send branded activation receipt. Best-effort — never
          // block the webhook response on email delivery. Look up the user
          // we just matched so we have their email + name for the email.
          try {
            const user = await prisma.user.findFirst({
              where,
              select: { id: true, name: true, email: true },
            });
            if (user?.email) {
              const amountTotal = session.amount_total ?? 0;
              const baseUrl =
                process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
              void sendSubscriptionActivatedEmail({
                recipientEmail: user.email,
                recipientName: user.name ?? "there",
                planName: subscriptionPlan ?? "Restore Assist",
                amount: amountTotal / 100, // Stripe amounts are in cents
                currency: (session.currency ?? "aud").toUpperCase(),
                invoiceUrl:
                  typeof session.invoice === "string"
                    ? null // Would need a second Stripe call to resolve to hosted URL
                    : (session.invoice?.hosted_invoice_url ?? null),
                dashboardUrl: `${baseUrl}/dashboard`,
                nextBillingDate: subscriptionEndsAt,
              });
            }
          } catch (err) {
            console.error(
              "[Stripe] Activation email lookup/send failed (non-fatal):",
              err,
            );
          }
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
          const subscriptionPlan = derivePlanNameFromSubscription(subscription);

          const renewResult = await prisma.user.updateMany({
            where: { stripeCustomerId: subscription.customer as string },
            data: {
              subscriptionStatus: "ACTIVE",
              subscriptionId: subscription.id,
              subscriptionPlan: subscriptionPlan ?? undefined,
              subscriptionEndsAt,
              nextBillingDate: subscriptionEndsAt,
              creditsRemaining: 999999,
            },
          });
          // RA-1306: loud log when the renewal hits an unknown customer.
          warnIfZeroRows(renewResult, "stripe.invoice.paid.renew", {
            customerId: subscription.customer,
            subscriptionId: subscription.id,
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

        // Map full Stripe status spectrum → our internal enum.
        // Previous code collapsed everything non-"active" to CANCELED which
        // lost PAST_DUE / UNPAID distinctions and blocked dunning recovery.
        const statusMap: Record<string, SubscriptionStatus> = {
          active: SubscriptionStatus.ACTIVE,
          trialing: SubscriptionStatus.TRIAL,
          past_due: SubscriptionStatus.PAST_DUE,
          unpaid: SubscriptionStatus.PAST_DUE,
          canceled: SubscriptionStatus.CANCELED,
          incomplete: SubscriptionStatus.TRIAL,
          incomplete_expired: SubscriptionStatus.EXPIRED,
          paused: SubscriptionStatus.CANCELED,
        };
        const mappedStatus =
          statusMap[updatedSubscription.status] ?? SubscriptionStatus.CANCELED;

        await prisma.user.updateMany({
          where: { subscriptionId: updatedSubscription.id },
          data: {
            subscriptionStatus: mappedStatus,
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

      case "customer.subscription.trial_will_end": {
        // Fires ~3 days before trial ends. Flag on the user so the UI can
        // show an in-app banner and a cron can send a reminder email.
        // We intentionally do NOT change subscriptionStatus here — user is
        // still on TRIAL until the period actually ends.
        const trialingSub = event.data.object as Stripe.Subscription;
        const trialEndsAt = trialingSub.trial_end
          ? new Date(trialingSub.trial_end * 1000)
          : null;

        if (trialingSub.customer && trialEndsAt) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: trialingSub.customer as string },
            data: { trialEndsAt },
          });
        }
        break;
      }

      case "customer.updated": {
        // Keep our cached email in sync if the user changes it in Stripe.
        // Email is not the canonical identifier (stripeCustomerId is), but
        // out-of-sync email can break billing notifications.
        const updatedCustomer = event.data.object as Stripe.Customer;
        if (updatedCustomer.email && updatedCustomer.id) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: updatedCustomer.id },
            data: { email: updatedCustomer.email },
          });
        }
        break;
      }

      case "charge.refunded": {
        // Revoke access on refund. Only if the charge is fully refunded —
        // partial refunds may or may not be material to the subscription.
        const refundedCharge = event.data.object as Stripe.Charge;
        if (
          refundedCharge.refunded &&
          refundedCharge.customer &&
          typeof refundedCharge.customer === "string"
        ) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: refundedCharge.customer },
            data: { subscriptionStatus: SubscriptionStatus.CANCELED },
          });
        }
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
    // Mark event as failed for retry visibility.
    // RA-1302 — if the audit update itself fails, log both errors. Otherwise
    // operators see "Stripe retried this event 10 times" with no trail of
    // WHY processing failed or whether the audit write also broke.
    const processingError = error;
    await prisma.stripeWebhookEvent
      .updateMany({
        where: { stripeEventId: event.id },
        data: {
          status: "FAILED",
          errorMessage:
            processingError instanceof Error
              ? processingError.message
              : "Unknown error",
        },
      })
      .catch((auditErr) => {
        console.error(
          `[Stripe] Audit update FAILED for failed event ${event.id}. Original error:`,
          processingError instanceof Error
            ? processingError.message
            : processingError,
        );
        console.error(
          `[Stripe] Audit update error:`,
          auditErr instanceof Error ? auditErr.message : auditErr,
        );
      });

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
