/**
 * customer.subscription.updated never restores access to a stored holder the
 * subscription does not belong to (review round 5, P1-R5-UPDATED-WEBHOOK-OWNER-BYPASS).
 *
 * The handler finds the user by subscriptionId. A subscription whose
 * metadata.userId names a different user must not flip that holder to ACTIVE;
 * a downgrade still applies, and a subscription naming nobody behaves as before.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/billing/subscription-event", () => ({
  recordSubscriptionEvent: vi.fn(async () => ({ kind: "recorded" })),
}));

import { handleSubscriptionUpdated } from "../route";
import { prisma } from "@/lib/prisma";

function updated(status: string, metadata: Record<string, string>) {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_x", status, metadata, items: { data: [] } } },
  };
}

describe("handleSubscriptionUpdated — explicit owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u1",
      subscriptionStatus: "CANCELED",
    } as never);
  });

  it("does not activate a holder the subscription names another owner for", async () => {
    await handleSubscriptionUpdated(updated("active", { userId: "u2" }) as never);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("still activates the named owner, and a subscription naming nobody", async () => {
    await handleSubscriptionUpdated(updated("active", { userId: "u1" }) as never);
    await handleSubscriptionUpdated(updated("active", {}) as never);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it("carries the new period end when a trial converts (trialing -> active, both ACTIVE)", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u1",
      subscriptionStatus: "ACTIVE",
      subscriptionEndsAt: new Date(1_900_000_000 * 1000),
    } as never);
    const ev = updated("active", { userId: "u1" }) as any;
    ev.data.object.items = { data: [{ current_period_end: 2_000_000_000 }] };
    await handleSubscriptionUpdated(ev);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { subscriptionEndsAt: new Date(2_000_000_000 * 1000), nextBillingDate: new Date(2_000_000_000 * 1000) },
    });

    // Another user's subscription, or a period end already stored, writes nothing.
    vi.mocked(prisma.user.update).mockClear();
    const other = updated("active", { userId: "u2" }) as any;
    other.data.object.items = { data: [{ current_period_end: 2_000_000_000 }] };
    await handleSubscriptionUpdated(other);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u1",
      subscriptionStatus: "ACTIVE",
      subscriptionEndsAt: new Date(2_000_000_000 * 1000),
    } as never);
    await handleSubscriptionUpdated(ev);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("still applies a downgrade to the stored holder", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u1",
      subscriptionStatus: "ACTIVE",
    } as never);
    await handleSubscriptionUpdated(updated("past_due", { userId: "u2" }) as never);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subscriptionStatus: "PAST_DUE" }) }),
    );
  });
});
