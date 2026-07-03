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
import {
  fulfillLifetimeFromSession,
  fulfillAddonFromSession,
} from "@/lib/billing/fulfill-one-time";
import { apiError } from "@/lib/api-errors";
import { PRICING_CONFIG } from "@/lib/pricing";

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
  // RA-6962 (review): set true when a FAILED/stale-PENDING row is reprocessed,
  // so the money-path handlers re-apply their idempotent state writes even when
  // their inner SubscriptionEvent dedupe reports the event as already seen.
  let reprocessing = false;
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
    // P2002 = unique constraint violation — an event row already exists.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // RA-6962: a duplicate row is NOT always a "successfully processed"
      // event. Inspect the existing row's status before acknowledging:
      //   - FAILED               → a prior delivery threw; reprocess.
      //   - PENDING & stale(>5m) → a prior delivery crashed before COMPLETED;
      //                            reprocess (the handlers are idempotent:
      //                            event-id dedupe + atomic guards).
      //   - COMPLETED / SKIPPED / fresh-PENDING → genuinely already handled or
      //                            in-flight; acknowledge 200 without reprocessing.
      const STALE_PENDING_MS = 5 * 60 * 1000;
      const existing = await prisma.stripeWebhookEvent
        .findUnique({
          where: { stripeEventId: event.id },
          select: { status: true, createdAt: true },
        })
        .catch(() => null);

      const isStalePending =
        existing?.status === "PENDING" &&
        Date.now() - existing.createdAt.getTime() > STALE_PENDING_MS;
      const shouldReprocess =
        existing?.status === "FAILED" || isStalePending;

      if (!shouldReprocess) {
        // Already COMPLETED/SKIPPED, or a fresh PENDING delivery is in flight.
        // Acknowledge without touching the row so a COMPLETED audit trail is
        // preserved and Stripe stops retrying.
        return NextResponse.json({ received: true });
      }

      // Flip the row back to PENDING and fall through to the processing switch
      // below. RA-1302 — log if the audit update itself fails so operators
      // keep a trail, but do not block reprocessing on it.
      reprocessing = true;
      await prisma.stripeWebhookEvent
        .updateMany({
          where: { stripeEventId: event.id },
          data: { status: "PENDING", errorMessage: null },
        })
        .catch((auditErr) => {
          console.error(
            `[Stripe] Audit reset FAILED for reprocessed event ${event.id}:`,
            auditErr instanceof Error ? auditErr.message : auditErr,
          );
        });
    } else {
      // Any other DB error — still attempt processing (don't block on audit table)
      console.error("[Stripe] Failed to record webhook event:", event.id);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(event, reprocessing);
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
        await handleSubscriptionUpdated(event, reprocessing);
        break;
      }

      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event, reprocessing);
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

        // R6 — one-time addon/lifetime payment intents legitimately carry NO
        // invoiceId (they are fulfilled via checkout.session.completed). Return
        // 2xx for them instead of 400, so Stripe does not enter a retry loop on
        // a payment that is not a RestoreAssist-invoice payment.
        if (!invoiceId) {
          const piType = paymentIntent.metadata?.type;
          const piUserId = paymentIntent.metadata?.userId;
          if (piType === "addon" || piType === "lifetime" || piUserId) {
            // Fulfilled elsewhere (the checkout.session.completed handler).
            break;
          }
          // Genuine RestoreAssist-invoice PI that should have carried an
          // invoiceId → 400 so Stripe retries and ops are alerted.
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
        // RA-6939 — scoped revocation. A refunded charge only warrants
        // subscription revocation when it is tied to a SUBSCRIPTION INVOICE.
        // Having an invoice is not enough (one-off charges can be invoiced);
        // the invoice must carry a `subscription` reference. A refunded
        // one-time addon/lifetime charge on a customer who also holds an
        // active subscription must NOT cancel that subscription. Partial
        // refunds are ignored (require full refund).
        await handleChargeRefunded(event);
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
export async function handleCheckoutCompleted(
  event: Stripe.Event,
  reprocessing = false,
) {
  const session = event.data.object as Stripe.Checkout.Session;

  // F4 / R4 — one-time (payment-mode) fulfillment now happens HERE on the
  // webhook, browser-independent. Replay-safety comes from the StripeWebhookEvent
  // event-id dedupe at the top of POST plus the helpers' own idempotency.
  if (session.mode === "payment") {
    if (session.metadata?.type === "lifetime") {
      await fulfillLifetimeFromSession(session);
    } else if (session.metadata?.type === "addon") {
      await fulfillAddonFromSession(session);
    }
    return;
  }

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

  // Idempotency: record event first.
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
  // RA-6962 (review): on a genuine reprocess (the OUTER webhook row was
  // FAILED/stale) the inner SubscriptionEvent row may already exist from the
  // failed first delivery, so recordSubscriptionEvent reports "deduped". The
  // activation + signup-bonus writes below are idempotent (updateMany with an
  // atomic signupBonusApplied guard), so we must still apply them. Only a
  // NORMAL replay (not a reprocess) short-circuits here.
  const dedupedReplay = recorded.kind === "deduped";
  if (dedupedReplay && !reprocessing) return;

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

  // RA-6962: grant the advertised first-signup bonus (+10 reports) exactly
  // once, atomically. The signupBonusApplied guard makes this idempotent — a
  // replayed event (already deduped above) or a reactivation of a user who
  // already claimed the bonus is a no-op. This is now the SOLE granter; the
  // browser verify/check paths no longer grant it (double-grant class removed).
  await prisma.user.updateMany({
    where: { id: metadataUserId, signupBonusApplied: false },
    data: {
      addonReports: { increment: PRICING_CONFIG.pricing.monthly.signupBonus },
      signupBonusApplied: true,
    },
  });

  // RA-6962 (review): on a reprocess of an already-recorded event the
  // idempotent state writes above have been re-applied; skip the
  // non-idempotent activation receipt so a duplicate email is not sent.
  if (dedupedReplay) return;

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
export async function handleSubscriptionUpdated(
  event: Stripe.Event,
  reprocessing = false,
) {
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
  // RA-6962 (review): the status-flip write below is idempotent, so a genuine
  // reprocess must still apply it even when the inner dedupe reports "seen".
  if (recorded.kind === "deduped" && !reprocessing) return;

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
 * Shared downgrade write. Flips a user to CANCELED and stamps the
 * cancellation time. Exported so the Stripe-reconciliation cron
 * (app/api/cron/reconcile-stripe) can apply the identical downgrade for
 * subscriptions Stripe reports canceled but that are still active locally.
 */
export async function downgradeUserToCanceled(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "CANCELED",
      subscriptionEndsAt: new Date(),
    },
  });
}

/**
 * Resolves the Stripe customer's email from a subscription event's customer
 * reference. Uses the expanded customer object when present, otherwise
 * retrieves it. Returns null when the customer is missing or deleted.
 */
async function customerEmailFromSubscription(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const customer = sub.customer;
  if (!customer) return null;

  if (typeof customer === "object") {
    return "deleted" in customer && customer.deleted
      ? null
      : (customer as Stripe.Customer).email ?? null;
  }

  const retrieved = await stripe.customers.retrieve(customer);
  if (retrieved.deleted) return null;
  return retrieved.email ?? null;
}

/**
 * SP-3 T8 — customer.subscription.deleted handler.
 *
 * Flips User.subscriptionStatus to CANCELED and writes a CANCELED
 * SubscriptionEvent. Dedupes by stripeEventId.
 *
 * RA-6939: the primary lookup is by local subscriptionId. When that misses
 * (e.g. the subscriptionId was never persisted), fall back to the Stripe
 * customer's email so the cancellation is not silently dropped — otherwise
 * the user keeps premium access after cancelling.
 */
export async function handleSubscriptionDeleted(
  event: Stripe.Event,
  reprocessing = false,
) {
  const sub = event.data.object as Stripe.Subscription;
  let user = await prisma.user.findFirst({
    where: { subscriptionId: sub.id },
    select: { id: true },
  });

  if (!user) {
    const email = await customerEmailFromSubscription(sub).catch(() => null);
    if (email) {
      user = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });
    }
  }

  if (!user) return;

  const recorded = await recordSubscriptionEvent({
    userId: user.id,
    eventType: "CANCELED",
    stripeEventId: event.id,
    payload: { subscriptionId: sub.id },
  });
  // RA-6962 (review): downgradeUserToCanceled is idempotent, so a genuine
  // reprocess must still apply it even when the inner dedupe reports "seen".
  if (recorded.kind === "deduped" && !reprocessing) return;

  await downgradeUserToCanceled(user.id);
}

/**
 * RA-6939 — charge.refunded handler with subscription-scoped revocation.
 *
 * A full refund only revokes access when the refunded charge belongs to a
 * SUBSCRIPTION invoice. The charge → subscription path is:
 *   charge.invoice (invoice id) → invoice.subscription (subscription ref).
 * A charge with no invoice, or an invoice with no `subscription`, is a one-off
 * (addon / lifetime / manual) refund and must leave the subscription untouched.
 *
 * Exported so unit tests can drive it with synthetic events.
 */
export async function handleChargeRefunded(event: Stripe.Event) {
  const refundedCharge = event.data.object as Stripe.Charge;

  // Only full refunds revoke. Partial refunds leave access in place.
  if (!refundedCharge.refunded) return;

  const customerId =
    typeof refundedCharge.customer === "string" ? refundedCharge.customer : null;
  if (!customerId) return;

  // A charge with no invoice is a one-off (e.g. a bare PaymentIntent addon).
  const invoiceRef = (refundedCharge as { invoice?: string | null }).invoice;
  if (!invoiceRef || typeof invoiceRef !== "string") {
    console.log(
      "[stripe-webhook] charge.refunded ignored — no invoice (one-off refund)",
      { eventId: event.id, chargeId: refundedCharge.id },
    );
    return;
  }

  // Resolve the invoice to test for a subscription linkage. In this SDK version
  // `subscription` is not on the typed Invoice surface, so read it the same way
  // the invoice.* handlers above do.
  const invoice = await stripe.invoices.retrieve(invoiceRef);
  const invoiceSubscriptionId = (invoice as { subscription?: string })
    .subscription;

  if (!invoiceSubscriptionId) {
    console.log(
      "[stripe-webhook] charge.refunded ignored — invoice not subscription-linked (one-off refund)",
      { eventId: event.id, chargeId: refundedCharge.id, invoiceId: invoiceRef },
    );
    return;
  }

  // Subscription invoice refund — revoke the matching user's subscription.
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!user) {
    console.error(
      "[stripe-webhook] charge.refunded — no user for stripeCustomerId",
      { eventId: event.id, customerId },
    );
    return;
  }

  await downgradeUserToCanceled(user.id);
}
