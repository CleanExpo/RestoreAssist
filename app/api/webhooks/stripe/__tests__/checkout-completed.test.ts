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

describe("checkout.session.completed handler", () => {
  let userId: string;
  beforeEach(async () => {
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
          subscription: "sub_test_123",
          customer: "cus_test_123",
          metadata: { userId, tier: "STANDARD" },
          payment_status: "paid",
        },
      },
    };
    await handleCheckoutCompleted(stripeEvent as never);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.subscriptionStatus).toBe("ACTIVE");
    expect(u.subscriptionId).toBe("sub_test_123");
    expect(u.stripeCustomerId).toBe("cus_test_123");
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
          subscription: "sub_dupe",
          customer: "cus_dupe",
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
