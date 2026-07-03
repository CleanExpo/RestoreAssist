/**
 * RA-6939 — scoped refund revocation.
 *
 * `charge.refunded` must revoke access ONLY when the refunded charge is tied to
 * a SUBSCRIPTION INVOICE (charge.invoice → invoice.subscription is set). A
 * refunded one-time addon/lifetime charge — no invoice, or an invoice with no
 * subscription — on a customer who also holds an active subscription must NOT
 * cancel that subscription.
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
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ id: "user_1" }),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    invoices: { retrieve: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "sig"]])),
}));
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// downgradeUserToCanceled writes via prisma.user.update; a one-off refund must
// leave the user untouched (neither update nor updateMany called for revocation).
const userUpdate = (
  prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }
).user.update;
const invoicesRetrieve = (
  stripe as unknown as { invoices: { retrieve: ReturnType<typeof vi.fn> } }
).invoices.retrieve;

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

describe("charge.refunded — scoped revocation (RA-6939)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      prisma as unknown as {
        stripeWebhookEvent: { create: ReturnType<typeof vi.fn> };
      }
    ).stripeWebhookEvent.create.mockResolvedValue({});
    (
      prisma as unknown as { user: { findFirst: ReturnType<typeof vi.fn> } }
    ).user.findFirst.mockResolvedValue({ id: "user_1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("does NOT cancel the subscription for a refunded one-time addon charge (no invoice)", async () => {
    // A one-time addon charge: no invoice at all.
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeChargeEvent({ invoice: null }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // No invoice → no retrieve, subscriptionStatus left untouched.
    expect(invoicesRetrieve).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("does NOT cancel the subscription for a refunded one-off invoiced charge (invoice has no subscription)", async () => {
    // Invoiced, but not a subscription invoice.
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeChargeEvent({ invoice: "in_oneoff" }) as never,
    );
    invoicesRetrieve.mockResolvedValue({ id: "in_oneoff", subscription: null });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(invoicesRetrieve).toHaveBeenCalledWith("in_oneoff");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("cancels the subscription for a refunded subscription-invoice charge", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeChargeEvent({ invoice: "in_123" }) as never,
    );
    invoicesRetrieve.mockResolvedValue({ id: "in_123", subscription: "sub_1" });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(invoicesRetrieve).toHaveBeenCalledWith("in_123");
    // downgradeUserToCanceled → prisma.user.update on the resolved user.
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_1" },
        data: expect.objectContaining({ subscriptionStatus: "CANCELED" }),
      }),
    );
  });
});
