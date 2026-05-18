/**
 * SP-3 T8 — Tests for the `customer.subscription.updated` +
 * `customer.subscription.deleted` handlers.
 *
 * Requires a live DB connection (uses real Prisma). Verifies status
 * mapping, no-op behaviour on unchanged status, and SubscriptionEvent
 * write on cancellation.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleSubscriptionUpdated, handleSubscriptionDeleted } from "../route";

describe.skipIf(!process.env.DATABASE_URL)("subscription.updated handler", () => {
  it("flips to PAST_DUE on status=past_due", async () => {
    const user = await prisma.user.create({
      data: {
        email: `pastdue-${Date.now()}-${Math.random()}@example.com`,
        password: "hash",
        subscriptionStatus: "ACTIVE",
        subscriptionId: `sub_pd_${Date.now()}`,
      },
    });
    const event = {
      id: `evt_pd_${Date.now()}`,
      type: "customer.subscription.updated",
      data: { object: { id: user.subscriptionId, status: "past_due" } },
    };
    await handleSubscriptionUpdated(event as never);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.subscriptionStatus).toBe("PAST_DUE");
  });

  it("no-op when status unchanged (active→active)", async () => {
    const user = await prisma.user.create({
      data: {
        email: `active-${Date.now()}-${Math.random()}@example.com`,
        password: "hash",
        subscriptionStatus: "ACTIVE",
        subscriptionId: `sub_act_${Date.now()}`,
      },
    });
    const event = {
      id: `evt_act_${Date.now()}`,
      type: "customer.subscription.updated",
      data: { object: { id: user.subscriptionId, status: "active" } },
    };
    await handleSubscriptionUpdated(event as never);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.subscriptionStatus).toBe("ACTIVE");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("subscription.deleted handler", () => {
  it("flips to CANCELED + writes SubscriptionEvent", async () => {
    const user = await prisma.user.create({
      data: {
        email: `del-${Date.now()}-${Math.random()}@example.com`,
        password: "hash",
        subscriptionStatus: "ACTIVE",
        subscriptionId: `sub_del_${Date.now()}`,
      },
    });
    const event = {
      id: `evt_del_${Date.now()}`,
      type: "customer.subscription.deleted",
      data: { object: { id: user.subscriptionId } },
    };
    await handleSubscriptionDeleted(event as never);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.subscriptionStatus).toBe("CANCELED");
    const ev = await prisma.subscriptionEvent.findFirstOrThrow({
      where: { userId: user.id, eventType: "CANCELED" },
    });
    expect(ev).toBeTruthy();
  });
});
