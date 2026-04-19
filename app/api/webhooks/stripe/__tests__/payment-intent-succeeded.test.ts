/**
 * RA-1139: Unit tests for payment_intent.succeeded handling in Stripe webhook.
 *
 * Covers the three scenarios from the decision table:
 *  1. Missing invoiceId metadata → 400 + error body
 *  2. Orphaned invoiceId (Invoice row not found) → 200 + warning
 *  3. Valid payment (Invoice row found) → 200 + paidDate set
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    invoicePayment: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock stripe so constructEvent returns our crafted event without signature verification
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

// Mock next/headers — the handler calls `await headers()` to get stripe-signature
vi.mock("next/headers", () => ({
  headers: vi
    .fn()
    .mockResolvedValue(new Map([["stripe-signature", "test-sig"]])),
}));

// ---------------------------------------------------------------------------
// Set env vars required by the handler (must be before import)
// ---------------------------------------------------------------------------
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaymentIntentEvent(
  metadata: Record<string, string> = {},
  amount = 33000,
  currency = "aud",
) {
  return {
    id: "evt_test_123",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_abc",
        amount,
        currency,
        metadata,
      },
    },
  };
}

function makeRequest(body = "{}") {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": "test-sig" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("payment_intent.succeeded webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: stripeWebhookEvent.create succeeds (no duplicate)
    vi.mocked(prisma.stripeWebhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.stripeWebhookEvent.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.invoicePayment.upsert).mockResolvedValue({} as never);

    // Suppress console.error noise in test output (the handler intentionally logs)
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 400 when invoiceId metadata is missing", async () => {
    // Event has no invoiceId in metadata
    const event = makePaymentIntentEvent({});
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing invoiceId metadata");
  });

  it("returns 200 with warning when invoiceId is present but Invoice row not found", async () => {
    // Event has an invoiceId but the DB returns null
    const event = makePaymentIntentEvent({ invoiceId: "inv_orphaned_999" });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.warning).toBe("orphaned_invoice_id");
  });

  it("returns 200 and sets paidDate when invoiceId matches an unpaid Invoice row", async () => {
    const invoiceId = "inv_valid_001";
    const userId = "user_owner_001";
    const event = makePaymentIntentEvent({ invoiceId }, 33000, "aud");
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    // Simulate an existing UNPAID invoice — include userId for InvoicePayment creation
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      status: "SENT",
      userId,
    } as never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({
      id: invoiceId,
      status: "PAID",
      paidDate: new Date(),
    } as never);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    // Invoice must be marked PAID with paidDate set
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paidDate: expect.any(Date),
        amountDue: 0,
      },
    });

    // InvoicePayment must be upserted with stripePaymentIntentId for reconciliation
    expect(prisma.invoicePayment.upsert).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: "pi_test_abc" },
      create: {
        amount: 33000,
        currency: "AUD",
        paymentMethod: "STRIPE",
        stripePaymentIntentId: "pi_test_abc",
        invoiceId,
        userId,
      },
      update: {},
    });
  });

  it("does not create InvoicePayment when invoice is already PAID (idempotency)", async () => {
    const invoiceId = "inv_already_paid";
    const event = makePaymentIntentEvent({ invoiceId });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    // Invoice is already PAID — handler should break early
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      status: "PAID",
      userId: "user_001",
    } as never);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(prisma.invoicePayment.upsert).not.toHaveBeenCalled();
  });
});
