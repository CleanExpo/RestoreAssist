/**
 * checkout.session.completed never records a subscription that names another
 * user against the session's user (owner rule, sweep after review round 5).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));
vi.mock("@/lib/billing/subscription-event", () => ({
  recordSubscriptionEvent: vi.fn(async () => ({ kind: "recorded" })),
}));

import { handleCheckoutCompleted } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const event = {
  id: "evt_c",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      mode: "subscription",
      customer: "cus_1",
      subscription: "sub_other",
      metadata: { userId: "u1" },
    },
  },
};

describe("handleCheckoutCompleted — explicit owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ subscriptionStatus: "TRIAL" } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not activate the session's user on a subscription that names another user", async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_other",
      metadata: { userId: "u2" },
      items: { data: [{ current_period_end: 2_000_000_000 }] },
    } as never);
    await handleCheckoutCompleted(event as never).catch(() => undefined);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
