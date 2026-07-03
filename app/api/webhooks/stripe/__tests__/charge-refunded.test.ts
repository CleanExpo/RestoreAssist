/**
 * R11 / AC9 (RA-6929/6930/6931) — scoped refund revocation.
 *
 * `charge.refunded` must revoke access ONLY when the refunded charge belongs to
 * a subscription (has an invoice/subscription linkage). A refunded one-time
 * addon/lifetime charge on a customer who also holds an active subscription
 * must NOT cancel that subscription.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent: vi.fn() } },
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

function makeChargeEvent(charge: Record<string, unknown>) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: "charge.refunded",
    data: { object: { refunded: true, customer: "cus_x", ...charge } },
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig" },
  });
}

describe("charge.refunded — scoped revocation (R11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      prisma as unknown as {
        stripeWebhookEvent: { create: ReturnType<typeof vi.fn> };
      }
    ).stripeWebhookEvent.create.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does NOT cancel the subscription for a refunded one-time addon charge", async () => {
    // A one-time addon charge: no invoice, no subscription linkage.
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeChargeEvent({ invoice: null }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // subscriptionStatus must be left untouched.
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("cancels the subscription for a refunded subscription-invoice charge", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeChargeEvent({ invoice: "in_123" }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeCustomerId: "cus_x" },
        data: expect.objectContaining({ subscriptionStatus: "CANCELED" }),
      }),
    );
  });
});
