/**
 * RA-6967 — checkout-lifetime hardening.
 *
 *   PI metadata  — payment_intent_data.metadata carries { userId, type } so the
 *                  webhook's one-time PaymentIntent handling can key on it.
 *   trusted base — success/cancel URLs come from getAppUrl(), never the
 *                  attacker-influencable Origin/Host request headers.
 *   GST          — inclusive tax + tax_id_collection preserved.
 *
 * Stripe, next-auth, rate-limiter, idempotency and Prisma are mocked. The
 * lifetime offer is gated to LIFETIME_PRICING_EMAIL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { LIFETIME_PRICING_EMAIL } from "@/lib/lifetime-pricing";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      _req: NextRequest,
      _scope: string,
      handler: () => Promise<Response>,
    ) => handler(),
  ),
}));

const stripeMock = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/checkout-lifetime", {
    method: "POST",
    headers,
  });
}

describe("POST /api/checkout-lifetime (RA-6967)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: LIFETIME_PRICING_EMAIL, name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: "cus_1",
      lifetimeAccess: false,
    } as never);
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_life_1",
      url: "https://checkout.stripe.com/x",
    });
  });

  it("attaches userId/type to payment_intent_data.metadata and preserves GST", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.payment_intent_data.metadata).toEqual({
      userId: "u1",
      type: "lifetime",
    });
    // Session metadata still present for the checkout.session.completed path.
    expect(arg.metadata).toEqual({ userId: "u1", type: "lifetime" });
    // GST compliance preserved.
    expect(arg.line_items[0].price_data.tax_behavior).toBe("inclusive");
    expect(arg.automatic_tax).toEqual({ enabled: true });
    expect(arg.tax_id_collection).toEqual({ enabled: true });
  });

  it("builds URLs from the trusted base, not the Origin header", async () => {
    const res = await POST(
      makeRequest({ origin: "https://evil.example", host: "evil.example" }),
    );
    expect(res.status).toBe(200);

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.success_url).toContain("https://restoreassist.app");
    expect(arg.cancel_url).toContain("https://restoreassist.app");
    expect(arg.success_url).not.toContain("evil.example");
    expect(arg.cancel_url).not.toContain("evil.example");
  });
});
