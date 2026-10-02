/**
 * Founding Trial early upgrade — founder decision 02/10/2026 (product-readiness FT-R3).
 *
 * A founding customer was promised the base plan free for 60 days, then $99/month.
 * If they subscribe before day 60, the first charge must land when the free days
 * end: Checkout carries subscription_data.trial_end = User.trialEndsAt. A normal
 * (non-founding) trial user keeps today's behaviour, and a founding trial ending
 * inside Stripe's 48-hour minimum is charged at checkout rather than refused.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/ios-billing-guard", () => ({
  rejectIfIOSCapacitor: vi.fn(() => null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _scope: string,
      handler: (raw: string) => Promise<Response>,
    ) => handler(await req.text()),
  ),
}));

const stripeMock = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  prices: { create: vi.fn(), retrieve: vi.fn() },
  products: { update: vi.fn() },
  subscriptions: { list: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    featureEntitlement: { findFirst: vi.fn() },
  },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";

const DAY = 24 * 60 * 60 * 1000;

function makeRequest() {
  return new NextRequest("http://localhost/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ plan: "monthly" }),
    headers: { "content-type": "application/json" },
  });
}

function setUser(trialEndsAt: Date | null, founding: boolean) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    stripeCustomerId: "cus_123",
    subscriptionStatus: "TRIAL",
    trialEndsAt,
    organization: { country: "AU" },
  } as never);
  // Only a query that asks for the complimentary founding marker finds the row,
  // so an implementation that ignores the marker cannot pass the negative case.
  vi.mocked(prisma.featureEntitlement.findFirst).mockImplementation((async (
    args: { where?: { stripePriceId?: string } } = {},
  ) =>
    founding && args.where?.stripePriceId === COMPLIMENTARY_PRICE_ID
      ? { id: "fe_1" }
      : null) as never);
}

function sessionArgs() {
  return stripeMock.checkout.sessions.create.mock.calls[0][0];
}

describe("POST /api/create-checkout-session — founding trial early upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.prices.retrieve.mockResolvedValue({
      id: PRICING_CONFIG.prices.monthly,
      currency: "aud",
      unit_amount: 9900,
      product: { id: "prod_monthly", statement_descriptor: "RESTOREASSIST" },
    });
    stripeMock.products.update.mockResolvedValue({ id: "prod_monthly" });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_123",
      url: "https://stripe.test/cs_123",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("charges a founding customer on day 60, not on the upgrade day", async () => {
    const trialEndsAt = new Date(Date.now() + 40 * DAY);
    setUser(trialEndsAt, true);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(sessionArgs().subscription_data.trial_end).toBe(
      Math.floor(trialEndsAt.getTime() / 1000),
    );
  });

  it("leaves a normal trial user's checkout unchanged", async () => {
    setUser(new Date(Date.now() + 10 * DAY), false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(sessionArgs().subscription_data.trial_end).toBeUndefined();
  });

  it("does not send a trial_end inside Stripe's 48-hour minimum", async () => {
    setUser(new Date(Date.now() + 24 * 60 * 60 * 1000), true);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(sessionArgs().subscription_data.trial_end).toBeUndefined();
  });
});
