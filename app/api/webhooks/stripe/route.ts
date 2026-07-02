import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import Stripe from "stripe";
import { SubscriptionStatus } from "@prisma/client";
import { sendSubscriptionActivatedEmail } from "@/lib/email";
import { warnIfZeroRows } from "@/lib/prisma-assert";
import { onInvoicePaid } from "@/lib/lifecycle/subscribers/invoice-paid";
import { recordSubscriptionEvent } from "@/lib/billing/subscription-event";
import { apiError } from "@/lib/api-errors";

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
    return apiError(request, {
      code: "VALIDATION",
      message: "No signature",
      status: 400,
    });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return apiError(request, {
      code: "INTERNAL",
      message: "Webhook secret not configured",
      status: 500,
      stage: "stripe-webhook:config",
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
        await handleCheckoutCompleted(event);
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
        await handleSubscriptionUpdated(event);
        break;
      }

      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event);
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
          return apiError(request, {
            code: "VALIDATION",
            message: "Missing invoiceId metadata",
            status: 400,
          });
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

        // Punch-list P1 #21 — fire-and-forget invoice-paid subscriber.
        // Notifies the tradie + writes AuditLog. Deliberately does NOT
        // advance Inspection.status (SP-A §5.3 editability invariant —
        // only the human presses "Close Job"). Per CLAUDE.md rule #13,
        // the subscriber is fire-and-forget so its failure cannot block
        // the webhook's 200 to Stripe. The subscriber catches internally
        // and returns a result; .catch here is a defense-in-depth net.
        void onInvoicePaid(invoiceId).catch((err) => {
          console.error(
            "[stripe-webhook] onInvoicePaid subscriber threw (non-fatal):",
            err instanceof Error ? err.message : err,
          );
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

/**
 * SP-3 T7 — checkout.session.completed handler.
 *
 * Flips the user's subscriptionStatus to ACTIVE and writes a SubscriptionEvent
 * row, deduping on stripeEventId. Preserves the pre-existing behaviour from
 * RA-907 / RA-1261 / RA-1306: Stripe subscription retrieve for period end,
 * plan-name derivation, and the branded activation receipt email — all
 * best-effort and wrapped so a Stripe API failure or email failure cannot
 * block the activation write.
 *
 * Exported so unit tests can call it directly with synthetic events.
 */
export async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "subscription") return;

  const metadataUserId = session.metadata?.userId ?? null;
  const tier = session.metadata?.tier ?? null;
  const customerId =
    typeof session.customer === "string" ? session.customer : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  if (!metadataUserId) {
    console.error(
      "[stripe-webhook] checkout.session.completed missing metadata.userId",
      event.id,
    );
    return;
  }

  // Determine event type from prior subscription state — reactivation vs
  // first-time activation are distinct lifecycle signals downstream.
  const existing = await prisma.user.findUnique({
    where: { id: metadataUserId },
    select: { subscriptionStatus: true },
  });
  const eventType: "SUBSCRIPTION_ACTIVATED" | "SUBSCRIPTION_REACTIVATED" =
    existing?.subscriptionStatus === SubscriptionStatus.CANCELED ||
    existing?.subscriptionStatus === SubscriptionStatus.EXPIRED
      ? "SUBSCRIPTION_REACTIVATED"
      : "SUBSCRIPTION_ACTIVATED";

  // Idempotency: record event first, bail on replay.
  const recorded = await recordSubscriptionEvent({
    userId: metadataUserId,
    eventType,
    stripeEventId: event.id,
    payload: {
      tier,
      sessionId: session.id,
      subscriptionId,
    },
  });
  if (recorded.kind === "deduped") return;

  // Best-effort: retrieve full subscription for accurate period end + plan
  // name. A failure here (e.g. fake sub ID in tests) must not block the
  // activation write — degrade gracefully.
  let subscriptionEndsAt: Date | null = null;
  let subscriptionPlan: string | null = null;
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      subscriptionEndsAt = new Date(
        (subscription.items.data[0]?.current_period_end ?? 0) * 1000,
      );
      subscriptionPlan = derivePlanNameFromSubscription(subscription);
    } catch (err) {
      console.error(
        "[stripe-webhook] subscriptions.retrieve failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const activationResult = await prisma.user.updateMany({
    where: { id: metadataUserId },
    data: {
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      stripeCustomerId: customerId ?? undefined,
      subscriptionId: subscriptionId ?? undefined,
      subscriptionPlan: subscriptionPlan ?? tier ?? undefined,
      subscriptionEndsAt: subscriptionEndsAt ?? undefined,
      nextBillingDate: subscriptionEndsAt ?? undefined,
      lastBillingDate: new Date(),
      creditsRemaining: 999999,
    },
  });
  warnIfZeroRows(activationResult, "stripe.checkout.completed.activate", {
    customerId,
    subscriptionId,
    userId: metadataUserId,
  });

  // RA-1261: best-effort branded activation receipt.
  try {
    const user = await prisma.user.findUnique({
      where: { id: metadataUserId },
      select: { id: true, name: true, email: true },
    });
    if (user?.email) {
      const amountTotal = session.amount_total ?? 0;
      const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
      void sendSubscriptionActivatedEmail({
        recipientEmail: user.email,
        recipientName: user.name ?? "there",
        planName: subscriptionPlan ?? tier ?? "Restore Assist",
        amount: amountTotal / 100,
        currency: (session.currency ?? "aud").toUpperCase(),
        invoiceUrl:
          typeof session.invoice === "string"
            ? null
            : (session.invoice?.hosted_invoice_url ?? null),
        dashboardUrl: `${baseUrl}/dashboard`,
        nextBillingDate: subscriptionEndsAt ?? new Date(),
      });
    }
  } catch (err) {
    console.error(
      "[stripe-webhook] activation email lookup/send failed (non-fatal):",
      err,
    );
  }
}

/**
 * Maps Stripe's subscription status spectrum to our internal enum.
 * Returns null for statuses we don't translate (e.g. "incomplete" → no flip).
 */
function stripeStatusToOurs(
  s: Stripe.Subscription.Status,
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | null {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "incomplete_expired":
      return "EXPIRED";
    default:
      return null;
  }
}

/**
 * SP-3 T8 — customer.subscription.updated handler.
 *
 * Reads the Stripe subscription status, maps to our internal enum, and
 * flips User.subscriptionStatus only if the mapped value differs from
 * the user's current status. No-op when unchanged (avoids spurious
 * SubscriptionEvent rows). Dedupes by stripeEventId.
 *
 * Preserves the pre-existing RA-907/RA-893 behaviour of refreshing
 * subscriptionEndsAt and nextBillingDate from the SubscriptionItem's
 * current_period_end when available.
 */
export async function handleSubscriptionUpdated(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const subscriptionId = sub.id;
  const stripeStatus = sub.status;

  const user = await prisma.user.findFirst({
    where: { subscriptionId },
    select: { id: true, subscriptionStatus: true },
  });
  if (!user) return;

  const mapped = stripeStatusToOurs(stripeStatus);
  if (mapped === null || mapped === user.subscriptionStatus) return;

  const recorded = await recordSubscriptionEvent({
    userId: user.id,
    eventType: mapped === "PAST_DUE" ? "PAYMENT_FAILED" : "TIER_CHANGED",
    stripeEventId: event.id,
    payload: { stripeStatus, previousStatus: user.subscriptionStatus },
  });
  if (recorded.kind === "deduped") return;

  // Preserve RA-907/RA-893: refresh period-end fields if present.
  const periodEnd = sub.items?.data?.[0]?.current_period_end;
  const subscriptionEndsAt =
    typeof periodEnd === "number" && periodEnd > 0
      ? new Date(periodEnd * 1000)
      : undefined;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: mapped,
      subscriptionEndsAt,
      nextBillingDate: subscriptionEndsAt,
    },
  });
}

/**
 * SP-3 T8 — customer.subscription.deleted handler.
 *
 * Flips User.subscriptionStatus to CANCELED and writes a CANCELED
 * SubscriptionEvent. Dedupes by stripeEventId.
 */
export async function handleSubscriptionDeleted(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const user = await prisma.user.findFirst({
    where: { subscriptionId: sub.id },
    select: { id: true },
  });
  if (!user) return;

  const recorded = await recordSubscriptionEvent({
    userId: user.id,
    eventType: "CANCELED",
    stripeEventId: event.id,
    payload: { subscriptionId: sub.id },
  });
  if (recorded.kind === "deduped") return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "CANCELED",
      subscriptionEndsAt: new Date(),
    },
  });
}
