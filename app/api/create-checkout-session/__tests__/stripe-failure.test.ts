/**
 * RA-6999 audit gap — proves the Stripe/DB failure paths surface as the
 * standard structured error envelope rather than an unhandled crash.
 *
 * The sibling `checkout-gst-guard.test.ts` greps the source for strings; it
 * would still pass if this route threw. Nothing anywhere asserted what happens
 * when Stripe itself rejects, which is the most likely production failure on
 * this route (outage, revoked key, rate limit). These tests drive the real
 * handler with a rejecting Stripe client and assert the envelope contract from
 * `lib/api-errors.ts`: { error: { code, message, eventId } }.
 *
 * The distinct `code` per branch is the point — asserting only "some 500" would
 * accept a generic ad-hoc response and would not prove the inner
 * `customers.create` handler is reached at all.
 *
 * Mocks mirror the sibling addons/checkout suites.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/ios-billing-guard", () => ({
  rejectIfIOSCapacitor: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
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
  subscriptions: { list: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
  checkout: { sessions: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";

const ALLOWED_PRICE = PRICING_CONFIG.prices.monthly;

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/create-checkout-session — Stripe failure handling", () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) — clearAllMocks leaves mockRejectedValue
    // implementations installed, which would leak a rejection from one test
    // into the next and let a test pass for the wrong reason.
    stripeMock.customers.create.mockReset();
    stripeMock.subscriptions.list.mockReset();
    stripeMock.billingPortal.sessions.create.mockReset();
    stripeMock.checkout.sessions.create.mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.update).mockReset();
    vi.mocked(getServerSession).mockReset();

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: "cus_1",
    } as never);
    // Default: no existing subscription, so the double-sub guard lets us through.
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
  });

  it("returns the INTERNAL envelope, not an unhandled throw, when sessions.create rejects", async () => {
    stripeMock.checkout.sessions.create.mockRejectedValue(
      new Error("Stripe is down"),
    );

    const res = await POST(makeRequest({ priceId: ALLOWED_PRICE }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.eventId).toEqual(expect.any(String));
    // The raw upstream message must never be echoed to the caller.
    expect(JSON.stringify(body)).not.toContain("Stripe is down");
  });

  it("returns the INTERNAL envelope when the customer lookup rejects mid-flight", async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("db gone"));

    const res = await POST(makeRequest({ priceId: ALLOWED_PRICE }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("db gone");
  });

  it("returns UPSTREAM_FAILED from the dedicated handler when customers.create rejects", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: null,
    } as never);
    stripeMock.customers.create.mockRejectedValue(new Error("cus fail"));

    const res = await POST(makeRequest({ priceId: ALLOWED_PRICE }));

    expect(res.status).toBe(500);
    const body = await res.json();
    // UPSTREAM_FAILED (not INTERNAL) is what proves the route's dedicated
    // create-stripe-customer handler ran, rather than the error merely
    // bubbling to the outer catch.
    expect(body.error.code).toBe("UPSTREAM_FAILED");
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns the INTERNAL envelope and creates no session when subscriptions.list rejects", async () => {
    stripeMock.subscriptions.list.mockRejectedValue(new Error("list fail"));

    const res = await POST(makeRequest({ priceId: ALLOWED_PRICE }));

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
    // Failing open here would let a second subscription be created — a double bill.
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
