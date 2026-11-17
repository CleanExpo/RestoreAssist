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
// The SDK types Status as an open union (`string & {}` catch-all). Dropping it
// leaves the known literals, so the table below fails type-check when a future
// SDK adds a status nobody has decided on. (tsconfig excludes __tests__, so this
// check has to live here, not in the test.)
type Literal<T> = T extends string ? (string extends T ? never : T) : never;
type KnownStatus = Literal<Stripe.Subscription.Status>;

// "BASE_TRIAL": ACTIVE only when an item is the base plan, otherwise no change.
const BY_STATUS: Record<KnownStatus, StripeDerivedStatus | "BASE_TRIAL" | null> = {
  active: "ACTIVE",
  trialing: "BASE_TRIAL",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete_expired: "EXPIRED",
  incomplete: null,
  paused: null,
};

export function subscriptionStatusFromStripe(
  sub: Pick<Stripe.Subscription, "status"> & {
    items?: { data?: Array<{ price?: { id?: string } | null }> } | null;
  },
): StripeDerivedStatus | null {
  // An unknown status (not an own key) changes nothing until someone decides.
  if (!Object.hasOwn(BY_STATUS, sub.status)) return null;
  const mapped = BY_STATUS[sub.status as KnownStatus];
  if (mapped !== "BASE_TRIAL") return mapped;
  return (sub.items?.data ?? []).some(
    (item) => item.price?.id === PRICING_CONFIG.prices.monthly,
  )
    ? "ACTIVE"
    : null;
}
