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
  prices: { create: vi.fn(), retrieve: vi.fn() },
  products: { update: vi.fn() },
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
    stripeMock.prices.retrieve.mockResolvedValue({
      id: MONTHLY,
      currency: "aud",
      unit_amount: 9900,
      product: {
        id: "prod_monthly",
        statement_descriptor: "RESTOREASSIST",
      },
    });
    stripeMock.products.update.mockResolvedValue({ id: "prod_monthly" });
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

  it("resolves plan:monthly to the server Stripe price (client-safe body)", async () => {
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: MONTHLY, quantity: 1 }],
      }),
    );
  });

  it("maps the client MONTHLY_PLAN placeholder to the configured Stripe price", async () => {
    // Browser bundles cannot read STRIPE_PRICE_MONTHLY; pricing.ts falls back
    // to this string. Server must not reject it as an unknown plan.
    const res = await POST(makeRequest({ priceId: "MONTHLY_PLAN" }));
    expect(res.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: MONTHLY, quantity: 1 }],
      }),
    );
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

  it("RA-7541: AU session pins AUD, disables Adaptive Pricing, and brands RestoreAssist", async () => {
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(200);
    expect(stripeMock.prices.retrieve).toHaveBeenCalledWith(MONTHLY, {
      expand: ["product"],
    });
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "aud",
        locale: "en",
        adaptive_pricing: { enabled: false },
        branding_settings: { display_name: "RestoreAssist" },
        line_items: [{ price: MONTHLY, quantity: 1 }],
        custom_text: {
          submit: {
            message: expect.stringMatching(/\$99 AUD/),
          },
        },
        subscription_data: expect.objectContaining({
          description: "RestoreAssist Monthly Plan",
        }),
      }),
    );
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0] as {
      branding_settings: { display_name: string };
    };
    expect(arg.branding_settings.display_name).not.toMatch(/CARSI/i);
  });

  it("RA-7541: NZ org still charges the AUD catalog (en-NZ copy only)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: "cus_123",
      organization: { country: "NZ" },
    } as never);
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "aud",
        locale: "en",
        adaptive_pricing: { enabled: false },
      }),
    );
  });

  it("RA-7541: rejects a USD / $73.85 Price and creates no session", async () => {
    stripeMock.prices.retrieve.mockResolvedValue({
      id: MONTHLY,
      currency: "usd",
      unit_amount: 7385,
      product: { id: "prod_monthly" },
    });
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/usd/i);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripeMock.products.update).not.toHaveBeenCalled();
  });

  it("RA-7541: patches a CARSI Product statement descriptor to RESTOREASSIST", async () => {
    stripeMock.prices.retrieve.mockResolvedValue({
      id: MONTHLY,
      currency: "aud",
      unit_amount: 9900,
      product: {
        id: "prod_monthly",
        statement_descriptor: "CARSI PTY LTD",
      },
    });
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(200);
    expect(stripeMock.products.update).toHaveBeenCalledWith("prod_monthly", {
      statement_descriptor: "RESTOREASSIST",
    });
  });

  it("RA-7541: stamps AU locale + country on a newly created Stripe customer", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: null,
      organization: { country: "AU" },
    } as never);
    stripeMock.customers.create.mockResolvedValue({ id: "cus_new" });
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(200);
    expect(stripeMock.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        preferred_locales: ["en-AU"],
        address: { country: "AU" },
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
