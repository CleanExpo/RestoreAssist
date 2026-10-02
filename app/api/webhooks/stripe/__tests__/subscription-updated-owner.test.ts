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
