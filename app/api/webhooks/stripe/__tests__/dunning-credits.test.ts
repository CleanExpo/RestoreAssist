/**
 * RA-6968 — unlimited-credit grant + dunning state transitions.
 *
 * Covers the previously-untested money-path handlers in the webhook switch:
 *   - customer.subscription.created  → ACTIVE + unlimited credits (999999)
 *   - invoice.payment_succeeded      → renewal refreshes billing dates + credits,
 *                                      resolving the subscription via the
 *                                      2026-05-27 parent.subscription_details path
 *   - invoice.payment_failed         → PAST_DUE (dunning)
 *
 * Credit granting is asserted idempotent/guarded: every delivery SETS
 * creditsRemaining to a fixed 999999 (never a read-modify-write increment), so a
 * replayed webhook converges to the same balance.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "sig"]])),
}));
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const userUpdateMany = (
  prisma as unknown as { user: { updateMany: ReturnType<typeof vi.fn> } }
).user.updateMany;
const subscriptionsRetrieve = (
  stripe as unknown as {
    subscriptions: { retrieve: ReturnType<typeof vi.fn> };
  }
).subscriptions.retrieve;

// 2026-05-27: period end lives on the SubscriptionItem, not the Subscription root.
const PERIOD_END_UNIX = 1_800_000_000;

function makeEvent(type: string, object: Record<string, unknown>) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: { object },
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig" },
  });
}

describe("customer.subscription.created — unlimited credit grant (RA-6968)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userUpdateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("activates the customer and grants unlimited credits", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeEvent("customer.subscription.created", {
        id: "sub_new",
        customer: "cus_1",
        items: { data: [{ current_period_end: PERIOD_END_UNIX }] },
      }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeCustomerId: "cus_1" },
        data: expect.objectContaining({
          subscriptionStatus: "ACTIVE",
          subscriptionId: "sub_new",
          creditsRemaining: 999999,
          subscriptionEndsAt: new Date(PERIOD_END_UNIX * 1000),
          nextBillingDate: new Date(PERIOD_END_UNIX * 1000),
        }),
      }),
    );
  });
});

describe("invoice.payment_succeeded — renewal refresh (RA-6968)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userUpdateMany.mockResolvedValue({ count: 1 });
    subscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ current_period_end: PERIOD_END_UNIX }] },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function renewalInvoice() {
    return makeEvent("invoice.payment_succeeded", {
      id: "in_renew",
      period_end: 1_700_000_000,
      // Root invoice.subscription was removed; linkage is under parent.
      parent: { subscription_details: { subscription: "sub_1" } },
    });
  }

  it("refreshes billing dates + credits, resolving the subscription via parent.subscription_details", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      renewalInvoice() as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledWith("sub_1");
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: "sub_1" },
        data: expect.objectContaining({
          // item-level current_period_end wins over invoice.period_end
          nextBillingDate: new Date(PERIOD_END_UNIX * 1000),
          creditsRemaining: 999999,
          lastBillingDate: expect.any(Date),
        }),
      }),
    );
  });

  it("does nothing when the invoice has no subscription linkage", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeEvent("invoice.payment_succeeded", {
        id: "in_oneoff",
        period_end: 1_700_000_000,
        parent: { subscription_details: null },
      }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("grants credits idempotently — a replayed renewal SETS the same 999999 (no increment)", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      renewalInvoice() as never,
    );

    await POST(makeRequest());
    await POST(makeRequest());

    const renewalWrites = userUpdateMany.mock.calls.filter(
      ([arg]) => (arg as { where?: { subscriptionId?: string } }).where
        ?.subscriptionId === "sub_1",
    );
    expect(renewalWrites).toHaveLength(2);
    for (const [arg] of renewalWrites) {
      const data = (arg as { data: Record<string, unknown> }).data;
      // Fixed set, not { increment }, so repeated delivery converges.
      expect(data.creditsRemaining).toBe(999999);
    }
  });
});

describe("invoice.payment_failed — dunning PAST_DUE (RA-6968)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userUpdateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("flips the subscriber to PAST_DUE, resolving the subscription via parent.subscription_details", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeEvent("invoice.payment_failed", {
        id: "in_failed",
        parent: { subscription_details: { subscription: "sub_1" } },
      }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: "sub_1" },
        data: { subscriptionStatus: "PAST_DUE" },
      }),
    );
  });

  it("does nothing when the failed invoice has no subscription linkage", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeEvent("invoice.payment_failed", {
        id: "in_failed_oneoff",
        parent: null,
      }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});
