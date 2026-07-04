/**
 * RA-6791 — verify-subscription is the lifetime fulfillment path.
 *
 * The Stripe `checkout.session.completed` webhook ignores sessions whose
 * mode !== 'subscription', so a one-time (mode:'payment', type:'lifetime')
 * purchase is only fulfilled when the success page POSTs to
 * /api/verify-subscription. This test asserts that path flips the user to
 * lifetimeAccess=true + subscriptionStatus ACTIVE.
 *
 * Stripe + Prisma are mocked (no live DB). No Idempotency-Key header is
 * sent, so withIdempotency passes straight through to the handler.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { retrieve: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/verify-subscription", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/verify-subscription — lifetime fulfillment (RA-6791)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 with no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as any);
    const res = await POST(makeRequest({ sessionId: "cs_test_1" }));
    expect(res.status).toBe(401);
  });

  it("sets lifetimeAccess=true + subscriptionStatus ACTIVE for a mode:payment / type:lifetime session", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as any);

    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
      id: "cs_lifetime_1",
      mode: "payment",
      payment_status: "paid",
      customer: "cus_life_1",
      metadata: { userId: "u1", type: "lifetime" },
    } as any);

    vi.mocked(prisma.user.update).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Lifetime",
      creditsRemaining: 999999,
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_lifetime_1" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subscription.status).toBe("ACTIVE");
    expect(body.subscription.plan).toBe("Lifetime");

    // The lifetime branch must persist lifetimeAccess=true + ACTIVE status.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const updateArg = vi.mocked(prisma.user.update).mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(updateArg.data).toMatchObject({
      lifetimeAccess: true,
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Lifetime",
      stripeCustomerId: "cus_life_1",
    });

    // Lifetime is one-time: it must NOT touch the subscription API.
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("returns 400 when payment is not completed (no fulfillment)", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as any);

    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
      id: "cs_lifetime_unpaid",
      mode: "payment",
      payment_status: "unpaid",
      customer: "cus_life_1",
      metadata: { userId: "u1", type: "lifetime" },
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_lifetime_unpaid" }));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/verify-subscription — subscription activation (RA-6962)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      creditsRemaining: 0,
    } as any);
  });

  function subSession() {
    return {
      id: "cs_sub_1",
      mode: "subscription",
      payment_status: "paid",
      customer: "cus_1",
      subscription: "sub_new",
      metadata: { userId: "u1" },
    };
  }
  function stripeSub(periodEnd: number, periodStart: number) {
    return {
      id: "sub_new",
      status: "active",
      created: 1_500_000_000,
      items: {
        data: [
          {
            current_period_end: periodEnd,
            current_period_start: periodStart,
            price: { recurring: { interval: "month" } },
          },
        ],
      },
    };
  }

  it("resets monthly usage + reads period end from items.data on a new activation, and does NOT grant the signup bonus", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      subSession() as any,
    );
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      stripeSub(2_000_000_000, 1_990_000_000) as any,
    );
    // Was on TRIAL with no stored subscription id -> genuine new activation.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionStatus: "TRIAL",
      subscriptionId: null,
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_sub_1" }));
    expect(res.status).toBe(200);

    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as any;
    expect(data.subscriptionStatus).toBe("ACTIVE");
    expect(data.monthlyReportsUsed).toBe(0);
    expect(data.monthlyResetDate).toBeInstanceOf(Date);
    // Period end/start read from the SubscriptionItem (no `as any` on the sub).
    expect(data.subscriptionEndsAt).toEqual(new Date(2_000_000_000 * 1000));
    expect(data.lastBillingDate).toEqual(new Date(1_990_000_000 * 1000));
    // Bonus is now webhook-only — the browser path must not touch these.
    expect(data.addonReports).toBeUndefined();
    expect(data.signupBonusApplied).toBeUndefined();
  });

  it("does NOT reset monthly usage when re-verifying the same active subscription", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      subSession() as any,
    );
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      stripeSub(2_000_000_000, 1_990_000_000) as any,
    );
    // Already ACTIVE on the SAME subscription id -> not a new activation.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionId: "sub_new",
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_sub_1" }));
    expect(res.status).toBe(200);

    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as any;
    expect(data.monthlyReportsUsed).toBeUndefined();
    expect(data.monthlyResetDate).toBeUndefined();
  });

  it("does NOT reset monthly usage when local status is CANCELED but the subscription id is unchanged (cancel->verify refill hole)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      subSession() as any,
    );
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      stripeSub(2_000_000_000, 1_990_000_000) as any,
    );
    // Post cancel_at_period_end: local CANCELED on the SAME still-active sub.
    // Must NOT be treated as a new activation.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionId: "sub_new",
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_sub_1" }));
    expect(res.status).toBe(200);

    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as any;
    expect(data.subscriptionStatus).toBe("ACTIVE");
    expect(data.monthlyReportsUsed).toBeUndefined();
    expect(data.monthlyResetDate).toBeUndefined();
  });
});

describe("POST /api/verify-subscription — session replay guard (RA-6972)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      creditsRemaining: 0,
    } as any);
  });

  it("rejects a paid session whose subscription is no longer active (does not reset usage or regress subscriptionId)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
      id: "cs_old",
      mode: "subscription",
      payment_status: "paid",
      customer: "cus_1",
      subscription: "sub_old",
      metadata: { userId: "u1" },
    } as any);
    // The replayed session points at a since-cancelled subscription.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_old",
      status: "canceled",
      created: 1_000_000_000,
      items: { data: [{ current_period_end: 1, current_period_start: 0 }] },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionId: "sub_new",
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_old" }));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses to regress subscriptionId to an older still-active subscription (replay of a changed sub)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
      id: "cs_old",
      mode: "subscription",
      payment_status: "paid",
      customer: "cus_1",
      subscription: "sub_old",
      metadata: { userId: "u1" },
    } as any);
    // Both subscriptions are active, but the stored one is newer -> the
    // incoming (older) session must not overwrite it or re-open the window.
    vi.mocked(stripe.subscriptions.retrieve).mockImplementation((id: any) => {
      if (id === "sub_old") {
        return Promise.resolve({
          id: "sub_old",
          status: "active",
          created: 1_000_000_000,
          items: {
            data: [
              {
                current_period_end: 2_000_000_000,
                current_period_start: 1_990_000_000,
                price: { recurring: { interval: "month" } },
              },
            ],
          },
        } as any);
      }
      return Promise.resolve({
        id: "sub_new",
        status: "active",
        created: 1_600_000_000,
        items: { data: [{ current_period_end: 3, current_period_start: 2 }] },
      } as any);
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionId: "sub_new",
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_old" }));
    expect(res.status).toBe(409);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/verify-subscription — stored-subscription retrieve failure (RA-6978)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      creditsRemaining: 0,
    } as any);
  });

  function subSession() {
    return {
      id: "cs_sub_1",
      mode: "subscription",
      payment_status: "paid",
      customer: "cus_1",
      subscription: "sub_new",
      metadata: { userId: "u1" },
    };
  }
  function stripeSub(periodEnd: number, periodStart: number) {
    return {
      id: "sub_new",
      status: "active",
      created: 1_600_000_000,
      items: {
        data: [
          {
            current_period_end: periodEnd,
            current_period_start: periodStart,
            price: { recurring: { interval: "month" } },
          },
        ],
      },
    };
  }

  it("allows the advance when the stored subscription is genuinely deleted (resource_missing)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      subSession() as any,
    );
    vi.mocked(stripe.subscriptions.retrieve).mockImplementation((id: any) => {
      if (id === "sub_new") {
        return Promise.resolve(stripeSub(2_000_000_000, 1_990_000_000) as any);
      }
      const err: any = new Error("No such subscription");
      err.code = "resource_missing";
      return Promise.reject(err);
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionId: "sub_deleted",
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_sub_1" }));
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as any;
    expect(data.subscriptionId).toBe("sub_new");
  });

  it("fails closed (does not advance) when the stored-subscription lookup hits a transient Stripe error", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      subSession() as any,
    );
    vi.mocked(stripe.subscriptions.retrieve).mockImplementation((id: any) => {
      if (id === "sub_new") {
        return Promise.resolve(stripeSub(2_000_000_000, 1_990_000_000) as any);
      }
      const err: any = new Error("Rate limit exceeded");
      err.statusCode = 429;
      return Promise.reject(err);
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionId: "sub_still_active_but_unreachable",
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_sub_1" }));
    expect(res.status).toBe(500);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
