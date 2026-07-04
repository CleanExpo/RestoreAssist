/**
 * RA-6968/6967 — GET /api/subscription reads the billing period from the
 * SubscriptionItem (dahlia) and never fabricates a now()+30d renewal date.
 *
 *   present — item-level current_period_end/start are surfaced + persisted.
 *   absent  — when Stripe omits them the stored dates are left untouched
 *             (no fabricated subscriptionEndsAt/nextBillingDate/lastBillingDate).
 *
 * Stripe, next-auth and Prisma are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const stripeMock = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn() },
  prices: { retrieve: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

function makeRequest() {
  return new NextRequest("http://localhost/api/subscription", {
    method: "GET",
  });
}

const dbUser = {
  subscriptionStatus: "ACTIVE",
  subscriptionPlan: "Monthly Plan",
  subscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  trialEndsAt: null,
  subscriptionEndsAt: new Date(0),
  creditsRemaining: 5,
  totalCreditsUsed: 0,
  lastBillingDate: new Date(0),
  nextBillingDate: new Date(0),
};

describe("GET /api/subscription — dahlia dates (RA-6968/6967)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    stripeMock.prices.retrieve.mockResolvedValue({
      id: "price_1",
      nickname: "Monthly",
      unit_amount: 2900,
      currency: "aud",
      recurring: { interval: "month" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads current_period_end/start from items.data and persists them", async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_1" },
            current_period_end: 2_000_000_000,
            current_period_start: 1_990_000_000,
          },
        ],
      },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.currentPeriodEnd).toBe(2_000_000_000);
    expect(body.subscription.currentPeriodStart).toBe(1_990_000_000);

    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as any;
    expect(data.subscriptionEndsAt).toEqual(new Date(2_000_000_000 * 1000));
    expect(data.nextBillingDate).toEqual(new Date(2_000_000_000 * 1000));
    expect(data.lastBillingDate).toEqual(new Date(1_990_000_000 * 1000));
  });

  it("does NOT fabricate dates when Stripe omits the item period", async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_1" },
            // current_period_end / current_period_start intentionally absent.
          },
        ],
      },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.currentPeriodEnd).toBeNull();
    expect(body.subscription.currentPeriodStart).toBeNull();

    // Stored dates must be left untouched — no now()+30d fabrication.
    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as any;
    expect(data.subscriptionEndsAt).toBeUndefined();
    expect(data.nextBillingDate).toBeUndefined();
    expect(data.lastBillingDate).toBeUndefined();
  });
});
