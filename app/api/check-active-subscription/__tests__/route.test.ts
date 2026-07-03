/**
 * RA-6962 (follow-up to #1674) — cancel -> poll -> refill hole.
 *
 * After cancel_at_period_end the local subscriptionStatus is CANCELED while
 * Stripe still reports the SAME subscription as active. The merged #1674 code
 * keyed the monthly-usage reset off `subscriptionStatus !== "ACTIVE"`, so a
 * poll of this route (the success page polls it; a user can POST it directly)
 * saw Stripe-active + local-CANCELED, treated it as a new activation, and
 * zeroed monthlyReportsUsed — a repeatable free monthly allowance with no new
 * billing period.
 *
 * Fix: reset ONLY when the Stripe subscription id differs from the stored one.
 * These tests prove a same-subscription poll does NOT reset usage, and a
 * genuinely new subscription id does.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));

const stripeMock = vi.hoisted(() => ({
  customers: { list: vi.fn() },
  subscriptions: { list: vi.fn() },
  checkout: { sessions: { list: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

function activeSub(id: string) {
  return {
    id,
    status: "active",
    created: 1000,
    items: {
      data: [
        {
          price: { recurring: { interval: "month" } },
          current_period_end: 2_000_000_000,
          current_period_start: 1_990_000_000,
        },
      ],
    },
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/check-active-subscription", {
    method: "POST",
  });
}

function baseUser(overrides: Record<string, unknown>) {
  return {
    id: "u1",
    email: "owner@example.com",
    stripeCustomerId: "cus_1",
    lifetimeAccess: false,
    subscriptionPlan: "Monthly Plan",
    ...overrides,
  };
}

describe("POST /api/check-active-subscription — monthly-usage reset (RA-6962)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      creditsRemaining: 0,
    } as never);
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [activeSub("sub_1")],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does NOT reset monthlyReportsUsed when local status is CANCELED but Stripe is active on the SAME subscription id", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      baseUser({ subscriptionStatus: "CANCELED", subscriptionId: "sub_1" }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    // Status is still refreshed to ACTIVE...
    expect(data.subscriptionStatus).toBe("ACTIVE");
    // ...but usage must NOT be re-gifted on the same subscription.
    expect(data.monthlyReportsUsed).toBeUndefined();
    expect(data.monthlyResetDate).toBeUndefined();
  });

  it("DOES reset monthlyReportsUsed when the Stripe subscription id is genuinely new", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      baseUser({ subscriptionStatus: "TRIAL", subscriptionId: null }) as never,
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.monthlyReportsUsed).toBe(0);
    expect(data.monthlyResetDate).toBeInstanceOf(Date);
  });
});
