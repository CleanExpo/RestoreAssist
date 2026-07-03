/**
 * RA-6965 — Unit tests for the generic webhook-processor payment path.
 *
 * Covers the two-part fix:
 *   1. XERO payment events are delegated to processXeroWebhookBatch, which
 *      resolves the REAL amount via the Xero Payments API — the generic path
 *      (which fabricated $0 "reconciled" payments from the webhook ID-stub) is
 *      never taken for XERO.
 *   2. QUICKBOOKS/MYOB payment events guard against ID-stubs: an unresolvable
 *      stub is skipped (no $0 payment, no throw); a resolvable stub records the
 *      real amount.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared tx mock for prisma.$transaction(async (tx) => ...) ──────────────────
const txInvoicePaymentCreate = vi.fn();
const txInvoiceUpdate = vi.fn();
const txInvoiceAuditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    integration: {
      findUnique: vi.fn(),
    },
    // Generic path wraps the payment insert in a transaction; hand the callback
    // a tx double so we can assert what would have been written.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        invoicePayment: { create: txInvoicePaymentCreate },
        invoice: { update: txInvoiceUpdate },
        invoiceAuditLog: { create: txInvoiceAuditLogCreate },
      }),
    ),
  },
}));

// Xero batch dependencies (we use the REAL batch, mock only its collaborators).
vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: vi.fn(),
}));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi
    .fn()
    .mockResolvedValue({ ok: true, data: "test-token" }),
}));

import { prisma } from "@/lib/prisma";
import { processWebhookEvent } from "../webhook-processor";

const mockFindUniqueEvent = prisma.webhookEvent.findUnique as ReturnType<
  typeof vi.fn
>;
const mockFindManyEvent = prisma.webhookEvent.findMany as ReturnType<
  typeof vi.fn
>;
const mockUpdateEvent = prisma.webhookEvent.update as ReturnType<typeof vi.fn>;
const mockFindFirstInvoice = prisma.invoice.findFirst as ReturnType<
  typeof vi.fn
>;
const mockUpdateInvoice = prisma.invoice.update as ReturnType<typeof vi.fn>;
const mockFindUniqueIntegration = prisma.integration.findUnique as ReturnType<
  typeof vi.fn
>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateEvent.mockResolvedValue({});
  (prisma.webhookEvent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue(
    { count: 1 },
  );
});

// ─── XERO delegation ──────────────────────────────────────────────────────────

describe("processWebhookEvent — XERO payment delegates to the Xero batch", () => {
  it("records the REAL amount via the Payments API, never a $0 payment", async () => {
    const xeroEvent = {
      id: "evt-xero-1",
      provider: "XERO",
      integrationId: "integ-x",
      eventType: "payment.created",
      status: "PENDING",
      retryCount: 0,
      payload: {
        resourceId: "xero-pay-1",
        resourceType: "PAYMENT",
        eventDateUtc: "2026-07-01T00:00:00.000Z",
      },
      integration: { id: "integ-x" },
    };

    // processWebhookEvent looks the event up by id...
    mockFindUniqueEvent.mockResolvedValue(xeroEvent);
    // ...then delegates to processXeroWebhookBatch which claims PENDING rows.
    mockFindManyEvent.mockResolvedValue([xeroEvent]);
    mockFindUniqueIntegration.mockResolvedValue({
      id: "integ-x",
      tenantId: "tenant-x",
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-1",
      status: "SENT",
      totalIncGST: 110000, // $1,100 inc GST (cents)
    });

    // Mock the Xero Payments API — full payment (AmountDue: 0 → PAID).
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Payments: [
            {
              Amount: 1100,
              Invoice: { InvoiceID: "xero-inv-1", AmountDue: 0 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await processWebhookEvent("evt-xero-1");

    // The batch resolved and wrote the REAL amount onto the invoice.
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "local-1" },
        data: expect.objectContaining({
          status: "PAID",
          amountPaid: 110000,
          amountDue: 0,
        }),
      }),
    );

    // The broken generic $0 path (which uses $transaction) was NOT taken.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

// ─── QUICKBOOKS / MYOB guard ──────────────────────────────────────────────────

describe("processWebhookEvent — QUICKBOOKS/MYOB stub guard", () => {
  it("skips an unresolvable QuickBooks stub without recording a $0 payment", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-1",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      status: "PENDING",
      retryCount: 0,
      payload: { Id: "qbo-pay-1", Operation: "Create" }, // CDC stub: no LinkedTxn, no TotalAmt
      integration: { id: "integ-q" },
    });

    await expect(processWebhookEvent("evt-qbo-1")).resolves.toBeUndefined();

    // No payment fabricated, no throw — event acknowledged as COMPLETED.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-qbo-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("records the real amount when a QuickBooks stub is resolvable", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-2",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      status: "PENDING",
      retryCount: 0,
      payload: {
        Id: "qbo-pay-2",
        LinkedTxn: [{ TxnId: "qbo-inv-2" }],
        TotalAmt: 500, // $500
        TxnDate: "2026-07-01",
        PaymentRefNum: "REF-1",
      },
      integration: { id: "integ-q" },
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-q",
      currency: "AUD",
      userId: "user-q",
    });
    txInvoicePaymentCreate.mockResolvedValue({ id: "pay-q" });
    // First tx invoice.update returns balances (amountDue 0 → mark PAID).
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 50000,
      amountDue: 0,
      totalIncGST: 50000,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-qbo-2");

    expect(txInvoicePaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 50000, // $500 → cents, the REAL amount (not $0)
          externalPaymentId: "qbo-pay-2",
          invoiceId: "local-q",
        }),
      }),
    );
  });
});
