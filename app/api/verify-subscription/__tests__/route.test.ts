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
      subscriptionPlan: "Lifetime Access",
      creditsRemaining: 999999,
    } as any);

    const res = await POST(makeRequest({ sessionId: "cs_lifetime_1" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subscription.status).toBe("ACTIVE");
    expect(body.subscription.plan).toBe("Lifetime Access");

    // The lifetime branch must persist lifetimeAccess=true + ACTIVE status.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const updateArg = vi.mocked(prisma.user.update).mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(updateArg.data).toMatchObject({
      lifetimeAccess: true,
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Lifetime Access",
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
