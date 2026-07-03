/**
 * F4 / R4 / R5 (RA-6929/6930/6931) — browser-independent, idempotent one-time
 * fulfillment.
 *
 * (a) a payment-mode lifetime checkout.session.completed grants lifetimeAccess
 *     with NO browser verify call;
 * (b) a payment-mode addon session credits addonReports + writes an
 *     AddonPurchase row;
 * (c) replaying the same session credits exactly once (deduped on the
 *     AddonPurchase.stripeSessionId marker; lifetime writes are absolute).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    addonPurchase: { findFirst: vi.fn(), create: vi.fn() },
    stripeWebhookEvent: { create: vi.fn(), updateMany: vi.fn() },
    subscriptionEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "sig"]])),
}));
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_PRICE_MONTHLY = "price_monthly_test";

import {
  fulfillLifetimeFromSession,
  fulfillAddonFromSession,
} from "@/lib/billing/fulfill-one-time";
import { handleCheckoutCompleted } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const p = prisma as unknown as {
  user: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  addonPurchase: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function lifetimeSession() {
  return {
    id: "cs_lifetime_1",
    mode: "payment",
    customer: "cus_life",
    payment_intent: "pi_life",
    metadata: { userId: "u_life", type: "lifetime" },
  } as never;
}

function addonSession() {
  return {
    id: "cs_addon_1",
    mode: "payment",
    customer: "cus_addon",
    payment_intent: "pi_addon",
    metadata: {
      userId: "u_addon",
      type: "addon",
      addonKey: "pack25",
      addonReports: "25",
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  p.user.update.mockResolvedValue({});
  p.$transaction.mockResolvedValue([{}, { addonReports: 25 }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fulfill-one-time helper (F4)", () => {
  it("(a) lifetime: grants lifetimeAccess with an absolute write, no verify call", async () => {
    const res = await fulfillLifetimeFromSession(lifetimeSession());
    expect(res.applied).toBe(true);
    expect(p.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u_life" },
        data: expect.objectContaining({
          lifetimeAccess: true,
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: "Lifetime",
          stripeCustomerId: "cus_life",
        }),
      }),
    );
  });

  it("(b) addon: credits reports + creates the AddonPurchase row", async () => {
    p.addonPurchase.findFirst.mockResolvedValue(null);
    const res = await fulfillAddonFromSession(addonSession());
    expect(res.applied).toBe(true);
    expect(p.$transaction).toHaveBeenCalledTimes(1);
  });

  it("(c) addon replay: same session id is deduped, credited exactly once", async () => {
    p.addonPurchase.findFirst.mockResolvedValue({ id: "ap_existing" });
    const res = await fulfillAddonFromSession(addonSession());
    expect(res.deduped).toBe(true);
    expect(res.applied).toBe(false);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("addon: unusable metadata does not credit", async () => {
    const res = await fulfillAddonFromSession({
      id: "cs_bad",
      mode: "payment",
      metadata: { userId: "u", type: "addon" },
    } as never);
    expect(res.applied).toBe(false);
    expect(p.$transaction).not.toHaveBeenCalled();
  });
});

describe("handleCheckoutCompleted routes payment-mode to the helper (R4)", () => {
  it("lifetime session fulfils browser-independently (no subscriptions.retrieve)", async () => {
    await handleCheckoutCompleted({
      id: "evt_life",
      type: "checkout.session.completed",
      data: { object: lifetimeSession() },
    } as never);
    expect(p.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lifetimeAccess: true }),
      }),
    );
    // Fulfilled from the event alone — the subscription retrieve path is never touched.
    expect(
      (stripe as unknown as { subscriptions: { retrieve: ReturnType<typeof vi.fn> } })
        .subscriptions.retrieve,
    ).not.toHaveBeenCalled();
  });

  it("addon session is fulfilled from the webhook", async () => {
    p.addonPurchase.findFirst.mockResolvedValue(null);
    await handleCheckoutCompleted({
      id: "evt_addon",
      type: "checkout.session.completed",
      data: { object: addonSession() },
    } as never);
    expect(p.$transaction).toHaveBeenCalledTimes(1);
  });
});
