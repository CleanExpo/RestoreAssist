/**
 * SP-3 T2 — Tests for recordSubscriptionEvent.
 *
 * Requires a live DB connection (uses real Prisma). Vitest is configured with
 * maxWorkers=1 so concurrent test files don't race on shared state. Each test
 * creates its own user fixture to keep rows independent.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordSubscriptionEvent } from "../subscription-event";

describe("recordSubscriptionEvent", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: `sp3-t2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "hash",
      },
    });
    userId = user.id;
  });

  it("writes a new SubscriptionEvent row", async () => {
    const result = await recordSubscriptionEvent({
      userId,
      eventType: "SUBSCRIPTION_ACTIVATED",
      stripeEventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      payload: { tier: "STANDARD" },
    });
    expect(result.kind).toBe("recorded");
    const row = await prisma.subscriptionEvent.findFirstOrThrow({
      where: { userId },
      select: { eventType: true },
    });
    expect(row.eventType).toBe("SUBSCRIPTION_ACTIVATED");
  });

  it("dedupes by stripeEventId on second call", async () => {
    const stripeEventId = `evt_dupe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await recordSubscriptionEvent({
      userId,
      eventType: "SUBSCRIPTION_ACTIVATED",
      stripeEventId,
      payload: null,
    });
    const second = await recordSubscriptionEvent({
      userId,
      eventType: "SUBSCRIPTION_ACTIVATED",
      stripeEventId,
      payload: null,
    });
    expect(second.kind).toBe("deduped");
    const count = await prisma.subscriptionEvent.count({
      where: { stripeEventId },
    });
    expect(count).toBe(1);
  });

  it("writes even without stripeEventId", async () => {
    const result = await recordSubscriptionEvent({
      userId,
      eventType: "TRIAL_EXPIRED",
      stripeEventId: null,
      payload: null,
    });
    expect(result.kind).toBe("recorded");
  });
});
