/**
 * SP-3 T7 — Tests for the `checkout.session.completed` handler.
 *
 * Requires a live DB connection (uses real Prisma). Verifies the handler
 * flips User.subscriptionStatus to ACTIVE, writes a SubscriptionEvent row,
 * and dedupes on replay by stripeEventId.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleCheckoutCompleted } from "../route";

describe.skipIf(!process.env.DATABASE_URL)("checkout.session.completed handler", () => {
  let userId: string;
  // `User.subscriptionId` and `User.stripeCustomerId` are both @unique, and the
  // release gate runs this file TWICE against one database -- once inside B3's
  // whole-suite run and again for D2-paywall-tests. Hardcoded IDs therefore
  // survive the first pass and make the second collide on the activation write.
  // Derive them per test, the same way the email and the Stripe event ID
  // already are. Both must be derived: they are written by the same UPDATE, so
  // fixing only one just moves the violation to the other index.
  let subscriptionId: string;
  let customerId: string;
  beforeEach(async () => {
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    subscriptionId = `sub_${nonce}`;
    customerId = `cus_${nonce}`;
    const u = await prisma.user.create({
      data: {
        email: `webhook-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "hash",
        subscriptionStatus: "TRIAL",
      },
    });
    userId = u.id;
  });

  it("flips subscriptionStatus to ACTIVE and writes SubscriptionEvent", async () => {
    const stripeEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: subscriptionId,
          customer: customerId,
          metadata: { userId, tier: "STANDARD" },
          payment_status: "paid",
        },
      },
    };
    await handleCheckoutCompleted(stripeEvent as never);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.subscriptionStatus).toBe("ACTIVE");
    expect(u.subscriptionId).toBe(subscriptionId);
    expect(u.stripeCustomerId).toBe(customerId);
    const ev = await prisma.subscriptionEvent.findFirstOrThrow({
      where: { userId },
    });
    expect(ev.eventType).toBe("SUBSCRIPTION_ACTIVATED");
  });

  it("dedupes on second call with same stripe event id", async () => {
    const stripeEventId = `evt_dupe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const stripeEvent = {
      id: stripeEventId,
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: subscriptionId,
          customer: customerId,
          metadata: { userId, tier: "STANDARD" },
          payment_status: "paid",
        },
      },
    };
    await handleCheckoutCompleted(stripeEvent as never);
    await handleCheckoutCompleted(stripeEvent as never);
    const count = await prisma.subscriptionEvent.count({
      where: { stripeEventId },
    });
    expect(count).toBe(1);
  });
});
