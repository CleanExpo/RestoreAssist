import type Stripe from "stripe";
import { PRICING_CONFIG } from "@/lib/pricing";

/** The account statuses a Stripe subscription can translate to. */
export type StripeDerivedStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

/**
 * RA-8431 — the ONE place a Stripe subscription becomes User.subscriptionStatus.
 *
 * The webhook, GET /api/subscription, verify-subscription, check-active-subscription
 * and the reconcile cron all call this. Three hand-written copies previously
 * disagreed: an `unpaid` customer was PAST_DUE from the webhook and EXPIRED from
 * the dashboard, flipping on every load. A discovering test
 * (lib/billing/__tests__/stripe-status-single-owner.test.ts) fails if a new copy
 * appears.
 *
 * `null` means "no change": leave the stored status alone.
 *
 * - `trialing` is ACTIVE only for the base $99 plan (a Founding Trial customer
 *   who subscribes early trials until day 60). A trialing subscription to any
 *   other price never grants or revokes the plan.
 * - `unpaid` is PAST_DUE so the paywall keeps the fix-your-card route
 *   (lib/billing/trial-expired-pay-route.ts) instead of "your trial expired".
 * - `incomplete` (first payment pending) and `paused` change nothing.
 */
export function subscriptionStatusFromStripe(
  sub: Pick<Stripe.Subscription, "status"> & {
    items?: { data?: Array<{ price?: { id?: string } | null }> } | null;
  },
): StripeDerivedStatus | null {
  const status = sub.status;
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return (sub.items?.data ?? []).some(
        (item) => item.price?.id === PRICING_CONFIG.prices.monthly,
      )
        ? "ACTIVE"
        : null;
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "incomplete_expired":
      return "EXPIRED";
    case "incomplete":
    case "paused":
      return null;
    default:
      // The SDK types Status as an open union (OtherString), so a status Stripe
      // adds later lands here: change nothing until someone decides its meaning.
      // The table test (Record<Stripe.Subscription.Status, …>) pins every known one.
      return null;
  }
}
