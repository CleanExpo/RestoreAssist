/**
 * RA-8431 — one owner turns a Stripe subscription into User.subscriptionStatus.
 *
 * Exhaustiveness is enforced at type-check time in the owner (BY_STATUS); this
 * table pins each known status's meaning at run time, plus unknown statuses.
 * `null` means "no change": the caller leaves the stored status alone.
 */
import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { PRICING_CONFIG } from "@/lib/pricing";
import { subscriptionStatusFromStripe } from "../stripe-status";
import { isLiveBaseSubscription } from "../live-base-subscription";

type Mapped = ReturnType<typeof subscriptionStatusFromStripe>;


const BASE = PRICING_CONFIG.prices.monthly;

function sub(status: Stripe.Subscription.Status, priceId = BASE) {
  return {
    status,
    items: { data: [{ price: { id: priceId } }] },
  } as unknown as Stripe.Subscription;
}

// Base-plan subscription, every status Stripe defines.
const EXPECTED: Record<string, Mapped> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  past_due: "PAST_DUE",
  // Keeps the fix-your-card paywall route (trial-expired-pay-route.ts).
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete_expired: "EXPIRED",
  incomplete: null,
  paused: null,
};

describe("subscriptionStatusFromStripe (RA-8431)", () => {
  for (const [status, expected] of Object.entries(EXPECTED)) {
    it(`base plan ${status} -> ${expected ?? "no change"}`, () => {
      expect(
        subscriptionStatusFromStripe(sub(status as Stripe.Subscription.Status)),
      ).toBe(expected);
    });
  }

  it("trialing WITHOUT a base-plan item is no change (never ACTIVE, never EXPIRED)", () => {
    expect(subscriptionStatusFromStripe(sub("trialing", "price_addon"))).toBeNull();
  });

  it("trialing with no items at all is no change", () => {
    expect(
      subscriptionStatusFromStripe({ status: "trialing" } as Stripe.Subscription),
    ).toBeNull();
  });

  it.each(["some_future_status", "constructor", "toString"])(
    "an unknown status %s is no change",
    (status) => {
      expect(subscriptionStatusFromStripe(sub(status))).toBeNull();
    },
  );

  it("an active subscription is ACTIVE whatever its price", () => {
    expect(subscriptionStatusFromStripe(sub("active", "price_other"))).toBe("ACTIVE");
  });

  it("isLiveBaseSubscription agrees with the owner on every status", () => {
    for (const status of Object.keys(EXPECTED) as Stripe.Subscription.Status[]) {
      for (const price of [BASE, "price_addon"]) {
        const s = sub(status, price);
        expect(isLiveBaseSubscription(s)).toBe(
          subscriptionStatusFromStripe(s) === "ACTIVE",
        );
      }
    }
  });
});
