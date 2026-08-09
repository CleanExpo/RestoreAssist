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

const tx = vi.hoisted(() => ({
  invoice: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  invoicePayment: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  invoicePaymentAllocation: { findUnique: vi.fn(), create: vi.fn() },
  invoiceAuditLog: { create: vi.fn() },
}));

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
    },
    $transaction: vi.fn(
      async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx),
    ),
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
vi.mock("@/lib/lifecycle/subscribers/invoice-paid", () => ({
  onInvoicePaid: vi.fn().mockResolvedValue({ ok: true, notified: true }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaymentIntentEvent(
  metadata: Record<string, string> = {},
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "evt_test_123",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_abc",
        status: "succeeded",
        amount_received: 10_000,
        currency: "aud",
        latest_charge: "ch_test_abc",
        created: 1_786_250_000,
        metadata,
        ...overrides,
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
    vi.mocked(prisma.$transaction).mockImplementation(
      async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx),
    );
    tx.invoice.updateMany.mockResolvedValue({ count: 1 });
    tx.invoicePayment.findUnique.mockResolvedValue(null);
    tx.invoicePaymentAllocation.findUnique.mockResolvedValue({
      allocatedAmount: 10_000,
    });
    tx.invoicePayment.create.mockResolvedValue({ id: "payment_1" });
    tx.invoicePaymentAllocation.create.mockResolvedValue({
      id: "allocation_1",
    });
    tx.invoiceAuditLog.create.mockResolvedValue({ id: "audit_1" });

    // Suppress console.error noise in test output (the handler intentionally logs)
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 400 when invoiceId metadata is missing (genuine invoice PI)", async () => {
    // A RestoreAssist-invoice PI with no invoiceId AND no one-time markers.
    const event = makePaymentIntentEvent({});
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("Missing invoiceId metadata");
  });

  // R6 — one-time addon/lifetime PIs legitimately carry no invoiceId and must
  // NOT 400 (they are fulfilled via checkout.session.completed).
  it("returns 2xx for an addon payment_intent with no invoiceId", async () => {
    const event = makePaymentIntentEvent({ type: "addon", userId: "u1" });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    // No invoice reconciliation attempted for a one-time-product PI.
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("returns 2xx for a lifetime payment_intent with no invoiceId", async () => {
    const event = makePaymentIntentEvent({ type: "lifetime", userId: "u1" });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
  });

  it("returns 200 with warning when invoiceId is present but Invoice row not found", async () => {
    // Event has an invoiceId but the DB returns null
    const event = makePaymentIntentEvent({ invoiceId: "inv_orphaned_999" });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);
    tx.invoice.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.warning).toBe("orphaned_invoice_id");
    expect(prisma.stripeWebhookEvent.updateMany).toHaveBeenCalledWith({
      where: { stripeEventId: "evt_test_123" },
      data: {
        status: "SKIPPED",
        processedAt: expect.any(Date),
        errorMessage: "Invoice inv_orphaned_999 was not found",
      },
    });
  });

  it("persists reconciled Stripe payment evidence and allocation atomically", async () => {
    const invoiceId = "inv_valid_001";
    const event = makePaymentIntentEvent({
      type: "invoice",
      invoiceId,
      invoiceNumber: "RA-2026-0001",
      userId: "user_1",
    });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);

    tx.invoice.findUnique.mockResolvedValue({
      id: invoiceId,
      invoiceNumber: "RA-2026-0001",
      userId: "user_1",
      status: "SENT",
      currency: "AUD",
      totalIncGST: 10_000,
      amountPaid: 0,
      amountDue: 10_000,
    });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: invoiceId, amountPaid: 0, amountDue: 10_000 },
      data: expect.objectContaining({
        amountPaid: 10_000,
        amountDue: 0,
        status: "PAID",
        paidDate: expect.any(Date),
      }),
    });
    expect(tx.invoicePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 10_000,
        currency: "AUD",
        paymentMethod: "STRIPE",
        stripePaymentIntentId: "pi_test_abc",
        stripeChargeId: "ch_test_abc",
        webhookEventId: "evt_test_123",
        invoiceId,
        userId: "user_1",
        reconciled: true,
        reconciledAt: expect.any(Date),
      }),
      select: { id: true },
    });
    expect(tx.invoicePaymentAllocation.create).toHaveBeenCalledWith({
      data: {
        paymentId: "payment_1",
        invoiceId,
        allocatedAmount: 10_000,
      },
    });
  });

  it("is idempotent when the PaymentIntent evidence already exists", async () => {
    const invoiceId = "inv_valid_001";
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makePaymentIntentEvent({
        type: "invoice",
        invoiceId,
        invoiceNumber: "RA-2026-0001",
        userId: "user_1",
      }) as never,
    );
    tx.invoice.findUnique.mockResolvedValue({
      id: invoiceId,
      invoiceNumber: "RA-2026-0001",
      userId: "user_1",
      status: "PAID",
      currency: "AUD",
      totalIncGST: 10_000,
      amountPaid: 10_000,
      amountDue: 0,
    });
    tx.invoicePayment.findUnique.mockResolvedValue({
      id: "payment_1",
      invoiceId,
      amount: 10_000,
      currency: "AUD",
      stripeChargeId: "ch_test_abc",
      reconciled: true,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
  });

  it("repairs a missing allocation when replaying valid payment evidence", async () => {
    const invoiceId = "inv_valid_001";
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makePaymentIntentEvent({
        type: "invoice",
        invoiceId,
        invoiceNumber: "RA-2026-0001",
        userId: "user_1",
      }) as never,
    );
    tx.invoice.findUnique.mockResolvedValue({
      id: invoiceId,
      invoiceNumber: "RA-2026-0001",
      userId: "user_1",
      status: "PAID",
      currency: "AUD",
      totalIncGST: 10_000,
      amountPaid: 10_000,
      amountDue: 0,
    });
    tx.invoicePayment.findUnique.mockResolvedValue({
      id: "payment_1",
      invoiceId,
      amount: 10_000,
      currency: "AUD",
      stripeChargeId: "ch_test_abc",
      reconciled: true,
    });
    tx.invoicePaymentAllocation.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(tx.invoicePaymentAllocation.create).toHaveBeenCalledWith({
      data: {
        paymentId: "payment_1",
        invoiceId,
        allocatedAmount: 10_000,
      },
    });
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["amount", { amount_received: 9_000 }],
    ["currency", { currency: "usd" }],
  ])(
    "fails closed when Stripe %s does not match the invoice",
    async (_label, overrides) => {
      const invoiceId = "inv_valid_001";
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
        makePaymentIntentEvent(
          {
            type: "invoice",
            invoiceId,
            invoiceNumber: "RA-2026-0001",
            userId: "user_1",
          },
          overrides,
        ) as never,
      );
      tx.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        invoiceNumber: "RA-2026-0001",
        userId: "user_1",
        status: "SENT",
        currency: "AUD",
        totalIncGST: 10_000,
        amountPaid: 0,
        amountDue: 10_000,
      });

      const response = await POST(makeRequest());

      expect(response.status).toBe(500);
      expect(tx.invoicePayment.create).not.toHaveBeenCalled();
      expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
    },
  );

  it("fails closed when PaymentIntent invoice identity metadata does not match", async () => {
    const invoiceId = "inv_valid_001";
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makePaymentIntentEvent({
        type: "invoice",
        invoiceId,
        invoiceNumber: "RA-2026-0001",
        userId: "different_user",
      }) as never,
    );
    tx.invoice.findUnique.mockResolvedValue({
      id: invoiceId,
      invoiceNumber: "RA-2026-0001",
      userId: "user_1",
      status: "SENT",
      currency: "AUD",
      totalIncGST: 10_000,
      amountPaid: 0,
      amountDue: 10_000,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
  });
});
