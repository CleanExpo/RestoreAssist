/**
 * P1-MNY-01 C7 — once invoice card payments go to the firm's own connected
 * account (flag on), an invoice PaymentIntent arriving on the PLATFORM
 * endpoint is money that landed in RestoreAssist's account, not the firm's.
 * It must not mark the invoice paid: the event is recorded SKIPPED and logged
 * for a person to resolve. With the flag off the existing reconciliation runs
 * unchanged (positive control).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const tx = vi.hoisted(() => ({
  invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
  invoicePayment: { findUnique: vi.fn(), create: vi.fn() },
  invoicePaymentAllocation: { findUnique: vi.fn(), create: vi.fn() },
  invoiceAuditLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    invoice: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent: vi.fn() } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "test-sig"]])),
}));
vi.mock("@/lib/lifecycle/subscribers/invoice-paid", () => ({
  onInvoicePaid: vi.fn().mockResolvedValue({ ok: true }),
}));

process.env.STRIPE_WEBHOOK_SECRET = "whsec_platform_fixture";

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const invoiceEvent = {
  id: "evt_platform_inv",
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_platform",
      status: "succeeded",
      amount_received: 10_000,
      currency: "aud",
      latest_charge: "ch_platform",
      created: 1_786_250_000,
      metadata: {
        type: "invoice",
        invoiceId: "inv_1",
        invoiceNumber: "INV-0001",
        userId: "u_1",
      },
    },
  },
};

function req() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "test-sig" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.stripeWebhookEvent.create).mockResolvedValue({} as never);
  vi.mocked(prisma.stripeWebhookEvent.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.$transaction).mockImplementation(
    async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  );
  vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(invoiceEvent as never);
  tx.invoice.findUnique.mockResolvedValue({
    id: "inv_1",
    invoiceNumber: "INV-0001",
    userId: "u_1",
    status: "SENT",
    currency: "AUD",
    totalIncGST: 10_000,
    amountPaid: 0,
    amountDue: 10_000,
  });
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.invoicePayment.findUnique.mockResolvedValue(null);
  tx.invoicePayment.create.mockResolvedValue({ id: "pay_1" });
  tx.invoicePaymentAllocation.create.mockResolvedValue({ id: "a_1" });
  tx.invoiceAuditLog.create.mockResolvedValue({ id: "al_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
});

describe("platform webhook with Connect invoice payments on", () => {
  it("positive control: flag off, the platform still reconciles as before", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(tx.invoice.updateMany).toHaveBeenCalledTimes(1);
  });

  it("flag on: a platform invoice PaymentIntent never marks the invoice paid", async () => {
    process.env.INVOICE_ONLINE_PAYMENT_ENABLED = "true";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(prisma.stripeWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: "evt_platform_inv" },
        data: expect.objectContaining({ status: "SKIPPED" }),
      }),
    );
    expect(console.error).toHaveBeenCalled();
  });
});
