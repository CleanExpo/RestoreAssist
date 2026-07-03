/**
 * RA-6929/6930/6931 — create-checkout-session correctness.
 *
 * A1 (b): a client-supplied priceId outside the server allowlist is rejected
 *         400 and NO Stripe price/session is created.
 * A1 (a): the valid allowlisted monthly price creates a session.
 * E1:     a customer with a live Stripe subscription (regardless of the
 *         drifted local subscriptionStatus) is blocked 409 and routed to the
 *         billing portal — no second subscription is created.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PRICING_CONFIG } from "@/lib/pricing";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/ios-billing-guard", () => ({
  rejectIfIOSCapacitor: vi.fn(() => null),
}));
// Idempotency wrapper: pass through, invoking the handler with the raw body.
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
  prices: { create: vi.fn() },
  subscriptions: { list: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const MONTHLY = PRICING_CONFIG.prices.monthly;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/create-checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: "cus_123",
    } as never);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_123",
      url: "https://stripe.test/cs_123",
    });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: "https://stripe.test/portal_123",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("A1(b): rejects an unknown priceId 400 and creates no Stripe price/session", async () => {
    const res = await POST(makeRequest({ priceId: "price_hacker_crafted" }));
    expect(res.status).toBe(400);
    expect(stripeMock.prices.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("A1(a): the allowlisted monthly price creates a subscription session", async () => {
    const res = await POST(makeRequest({ priceId: MONTHLY }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://stripe.test/cs_123");
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    // No dynamic price is ever created.
    expect(stripeMock.prices.create).not.toHaveBeenCalled();
    // AC8 — AU GST handling on the subscription checkout path.
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
      }),
    );
  });

  it("E1: blocks a second subscription (409) and returns the portal URL when a live Stripe sub exists", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ status: "active" }],
    });
    const res = await POST(makeRequest({ priceId: MONTHLY }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.portalRequired).toBe(true);
    expect(body.url).toBe("https://stripe.test/portal_123");
    // Critically: no second subscription session was created.
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("E1: a trialing Stripe sub also blocks (local status may be drifted)", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ status: "trialing" }],
    });
    const res = await POST(makeRequest({ priceId: MONTHLY }));
    expect(res.status).toBe(409);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
