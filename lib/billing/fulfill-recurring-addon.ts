/**
 * Shared recurring add-on (subscription-mode) fulfillment.
 *
 * Recurring packs (BOOKKEEPING, SERVICE_CRM, VOICE, …) create a SEPARATE Stripe
 * Subscription stamped with registry metadata. The FeatureEntitlement row is the
 * SSOT that `requireAddon()` and `/api/addons/catalog` both read.
 *
 * Primary path: Stripe webhook `customer.subscription.*` →
 * `applyRecurringAddonSubscription`.
 *
 * Self-heal / local-dev path: browser success page → `/api/addons/verify` and
 * webhook `checkout.session.completed` → `fulfillRecurringAddonFromSession`,
 * which retrieves the Subscription and applies the same upsert. Idempotent on
 * `(workspaceId, sku)`.
 *
 * Mirrors `lib/billing/fulfill-one-time.ts` for report packs / lifetime.
 */

import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  getRecurringAddon,
  getRecurringAddonBySubscriptionType,
} from "@/lib/billing/addon-registry";
import type { FulfillResult } from "@/lib/billing/fulfill-one-time";
import {
  COMPLIMENTARY_PRICE_ID,
  isComplimentaryEntitlement,
} from "@/lib/billing/founding-trial-grant";

export interface RecurringAddonFulfillResult extends FulfillResult {
  sku?: string;
  workspaceId?: string;
}

/**
 * Upsert FeatureEntitlement from a Stripe Subscription's metadata.
 *
 * @returns `true` when this is one of our recurring add-on subscriptions
 *   (handled — caller must NOT run base-plan handlers), `false` otherwise.
 */
export async function applyRecurringAddonSubscription(
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const subscriptionType = subscription.metadata?.type;
  if (!subscriptionType) return false;

  const descriptor = getRecurringAddonBySubscriptionType(subscriptionType);
  if (!descriptor) return false;

  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) {
    // It IS one of our add-on events, but without a workspace we cannot grant
    // the entitlement. Log and claim it (return true) so the caller does not
    // fall through to the base-plan handlers with an add-on subscription id.
    console.error(
      "[recurring-addon] subscription missing workspaceId metadata",
      subscription.id,
    );
    return true;
  }

  const active =
    subscription.status === "active" || subscription.status === "trialing";
  const stripePriceId = subscription.items?.data?.[0]?.price?.id ?? null;

  // RA-6920 B6 — persist the purchased seat count for the quantity-based
  // TECHNICIAN_SEATS add-on only. Flat add-ons leave `seats` untouched (null).
  const seats = descriptor.perSeat
    ? (subscription.items?.data?.[0]?.quantity ?? 1)
    : undefined;

  // RA-7721 — a Founding Trial grant is free and stays free: never overwrite
  // or deactivate a complimentary row (a checkout opened before the grant, or
  // any later subscription event). The filter makes the write conditional in
  // the same statement. When it does not match an existing row, Prisma falls
  // back to create and hits the unique key; the row is then re-read, and the
  // event is skipped only if that row really is complimentary. Otherwise the
  // conflict was two events for one subscription racing, and the write is
  // retried once, now as an update.
  const where = {
    workspaceId_sku: { workspaceId, sku: descriptor.sku },
    OR: [
      { stripePriceId: null },
      { NOT: { stripePriceId: COMPLIMENTARY_PRICE_ID } },
    ],
  };
  const values = {
    active,
    seats,
    stripeSubscriptionId: subscription.id,
    stripePriceId,
  };
  const write = () =>
    prisma.featureEntitlement.upsert({
      where,
      create: { workspaceId, sku: descriptor.sku, ...values },
      update: values,
    });

  try {
    await write();
  } catch (e) {
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError) ||
      e.code !== "P2002"
    ) {
      throw e;
    }
    const current = await prisma.featureEntitlement.findUnique({
      where: { workspaceId_sku: { workspaceId, sku: descriptor.sku } },
      select: { stripePriceId: true },
    });
    if (isComplimentaryEntitlement(current)) {
      // A paid subscription exists for an add-on this business holds free
      // (a checkout that completed after the Founding Trial grant). The free
      // row is kept; whether to cancel and refund the subscription is an
      // owner decision (RULES.md #32), so it is surfaced, not actioned.
      const active =
        subscription.status === "active" || subscription.status === "trialing";
      (active ? console.error : console.warn)(
        active
          ? "[recurring-addon] PAID SUBSCRIPTION ON A FREE FOUNDING TRIAL ADD-ON — needs owner review (cancel/refund)"
          : "[recurring-addon] complimentary entitlement kept; subscription event not applied",
        {
          workspaceId,
          sku: descriptor.sku,
          subscriptionId: subscription.id,
          customerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : (subscription.customer?.id ?? null),
          status: subscription.status,
        },
      );
      return true;
    }
    await write();
  }

  return true;
}

/**
 * Grant a recurring add-on entitlement from a completed Checkout Session
 * (`mode: subscription`, `metadata.type: addon_subscription`).
 *
 * Used by the webhook `checkout.session.completed` handler (so add-on checkouts
 * never fall through into base-plan activation) and by `/api/addons/verify`
 * (browser self-heal when webhooks are not reaching localhost).
 */
export async function fulfillRecurringAddonFromSession(
  session: Stripe.Checkout.Session,
): Promise<RecurringAddonFulfillResult> {
  if (session.metadata?.type !== "addon_subscription") {
    return { applied: false, reason: "not addon_subscription" };
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    return { applied: false, reason: "missing subscription on session" };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Session metadata.type is "addon_subscription" (checkout marker) — NOT the
  // registry subscriptionType (e.g. "bookkeeping_addon"). Prefer the
  // Subscription's stamped type; if thin (local race), resolve via sku.
  const sku =
    subscription.metadata?.sku || session.metadata?.sku || undefined;
  const descriptorFromSku = sku ? getRecurringAddon(sku) : undefined;
  const subscriptionType =
    subscription.metadata?.type ||
    descriptorFromSku?.subscriptionType ||
    "";

  const workspaceId =
    subscription.metadata?.workspaceId ||
    session.metadata?.workspaceId ||
    "";

  const merged: Stripe.Subscription = {
    ...subscription,
    metadata: {
      ...subscription.metadata,
      type: subscriptionType,
      workspaceId,
      sku: sku || "",
      userId:
        subscription.metadata?.userId || session.metadata?.userId || "",
    },
  };

  const handled = await applyRecurringAddonSubscription(merged);
  if (!handled) {
    return { applied: false, reason: "unrecognized addon subscription type" };
  }

  // If workspace was missing, apply claimed the event but did not upsert.
  if (!workspaceId) {
    return {
      applied: false,
      reason: "missing workspaceId metadata",
      sku: sku || undefined,
    };
  }

  return {
    applied: true,
    sku: sku || undefined,
    workspaceId,
  };
}

/**
 * Reconcile FeatureEntitlement rows from the customer's live Stripe
 * subscriptions. Heals local/dev (and missed-webhook) cases where Checkout
 * succeeded but `customer.subscription.*` never reached the app.
 *
 * Safe to call repeatedly — each apply is an idempotent upsert.
 *
 * @returns number of recurring add-on subscriptions examined
 */
export async function syncRecurringAddonsFromStripe(
  stripeCustomerId: string,
): Promise<{ examined: number; granted: number }> {
  const listed = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });

  let examined = 0;
  let granted = 0;

  for (const sub of listed.data) {
    const type = sub.metadata?.type;
    if (!type || !getRecurringAddonBySubscriptionType(type)) continue;
    examined += 1;
    const beforeActive =
      sub.status === "active" || sub.status === "trialing";
    await applyRecurringAddonSubscription(sub);
    if (beforeActive) granted += 1;
  }

  return { examined, granted };
}
