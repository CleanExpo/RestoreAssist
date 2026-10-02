import type Stripe from "stripe";
import { PRICING_CONFIG } from "@/lib/pricing";

/**
 * May this Stripe subscription activate the account's base plan from the
 * browser success path (verify-subscription, check-active-subscription)?
 *
 * "active" keeps its existing meaning. "trialing" is admitted ONLY for the base
 * $99 plan: a Founding Trial customer who subscribes early is trialing until
 * day 60 (create-checkout-session trial_end). A trialing add-on must never be
 * recorded as the plan — the webhook routes add-ons to entitlements instead
 * (app/api/webhooks/stripe/route.ts applyRecurringAddonSubscription).
 */
export function isLiveBaseSubscription(sub: Stripe.Subscription): boolean {
  if (sub.status === "active") return true;
  if (sub.status !== "trialing") return false;
  return sub.items.data.some(
    (item) => item.price?.id === PRICING_CONFIG.prices.monthly,
  );
}
