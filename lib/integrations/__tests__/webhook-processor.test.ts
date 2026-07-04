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

// RA-6984 — QUICKBOOKS/MYOB payment resolution now calls the provider API
// (mirroring the Xero Payments API call above) instead of trusting the
// webhook stub. Mock the client factories/instances rather than fetch, since
// the real clients live behind OAuth/token-refresh plumbing out of scope here.
const qboGetPayment = vi.fn();
const myobGetCustomerPayment = vi.fn();

vi.mock("@/lib/integrations/quickbooks/client", () => ({
  createQuickBooksClient: vi.fn(async (_integrationId: string) => ({
    getPayment: (...args: unknown[]) => qboGetPayment(...args),
  })),
}));
vi.mock("@/lib/integrations/myob/client", () => ({
  createMYOBClient: vi.fn(async (_integrationId: string) => ({
    getCustomerPayment: (...args: unknown[]) =>
      myobGetCustomerPayment(...args),
  })),
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

// ─── QUICKBOOKS / MYOB — RA-6984 API resolution ────────────────────────────────

describe("processWebhookEvent — QUICKBOOKS payment resolution via the QBO API", () => {
  it("skips without recording when the event carries no entity id", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-1",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      status: "PENDING",
      retryCount: 0,
      payload: {}, // no id — cannot even attempt resolution
      integration: { id: "integ-q" },
    });

    await expect(processWebhookEvent("evt-qbo-1")).resolves.toBeUndefined();

    expect(qboGetPayment).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-qbo-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("calls the QBO Payments API with the CDC entity id and records the REAL resolved amount", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-2",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      // The CDC webhook stub for a Payment "Create" only ever carries this —
      // never LinkedTxn/TotalAmt (RA-6974 / #1699).
      payload: { name: "Payment", id: "qbo-pay-2", operation: "Create" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-q" },
    });
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-2",
      TotalAmt: 500, // $500 — the REAL settled amount, resolved via the API
      TxnDate: "2026-07-01",
      PaymentRefNum: "REF-1",
      Line: [
        {
          Amount: 500,
          LinkedTxn: [{ TxnId: "qbo-inv-2", TxnType: "Invoice" }],
        },
      ],
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-q",
      currency: "AUD",
      userId: "user-q",
    });
    txInvoicePaymentCreate.mockResolvedValue({ id: "pay-q" });
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 50000,
      amountDue: 0,
      totalIncGST: 50000,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-qbo-2");

    expect(qboGetPayment).toHaveBeenCalledWith("qbo-pay-2");
    expect(mockFindFirstInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalInvoiceId: "qbo-inv-2",
          externalSyncProvider: "QUICKBOOKS",
        }),
      }),
    );
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

  it("skips without recording when the resolved payment has no invoice LinkedTxn", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-3",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      payload: { name: "Payment", id: "qbo-pay-3", operation: "Create" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-q" },
    });
    // Resolved payment with no LinkedTxn at all — e.g. an unapplied credit.
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-3",
      TotalAmt: 200,
      TxnDate: "2026-07-01",
      Line: [{ Amount: 200 }],
    });

    await processWebhookEvent("evt-qbo-3");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-qbo-3" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });
});

describe("processWebhookEvent — MYOB payment resolution via the MYOB API", () => {
  it("skips without recording when the event carries no ResourceUID", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-myob-1",
      provider: "MYOB",
      integrationId: "integ-m",
      eventType: "payment.created",
      status: "PENDING",
      retryCount: 0,
      payload: {}, // no ResourceUID — cannot even attempt resolution
      integration: { id: "integ-m" },
    });

    await expect(processWebhookEvent("evt-myob-1")).resolves.toBeUndefined();

    expect(myobGetCustomerPayment).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
  });

  it("calls the MYOB API with the notification's ResourceUID and records the REAL resolved amount", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-myob-2",
      provider: "MYOB",
      integrationId: "integ-m",
      eventType: "payment.created",
      // The raw Sale.CustomerPayment "Created" notification only ever
      // carries this — never Amount/InvoiceUID (RA-6974 / #1699).
      payload: {
        CompanyFileId: "cf_1",
        EventType: "Created",
        ResourceType: "Sale.CustomerPayment",
        ResourceUID: "myob-pay-2",
      },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-m" },
    });
    myobGetCustomerPayment.mockResolvedValue({
      UID: "myob-pay-2",
      Date: "2026-07-01T00:00:00",
      AmountReceived: 550, // the REAL settled amount, resolved via the API
      Invoices: [{ UID: "myob-inv-2", Number: "INV-2", AmountApplied: 550 }],
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-m",
      currency: "AUD",
      userId: "user-m",
    });
    txInvoicePaymentCreate.mockResolvedValue({ id: "pay-m" });
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 55000,
      amountDue: 0,
      totalIncGST: 55000,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-myob-2");

    expect(myobGetCustomerPayment).toHaveBeenCalledWith("myob-pay-2");
    expect(mockFindFirstInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalInvoiceId: "myob-inv-2",
          externalSyncProvider: "MYOB",
        }),
      }),
    );
    expect(txInvoicePaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 55000, // $550 → cents, the REAL amount (not $0)
          externalPaymentId: "myob-pay-2",
          invoiceId: "local-m",
        }),
      }),
    );
  });

  it("skips without recording when the resolved payment has no applied invoices", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-myob-3",
      provider: "MYOB",
      integrationId: "integ-m",
      eventType: "payment.created",
      payload: {
        CompanyFileId: "cf_1",
        EventType: "Created",
        ResourceType: "Sale.CustomerPayment",
        ResourceUID: "myob-pay-3",
      },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-m" },
    });
    // Resolved payment applied to nothing yet (e.g. on-account payment).
    myobGetCustomerPayment.mockResolvedValue({
      UID: "myob-pay-3",
      Date: "2026-07-01T00:00:00",
      AmountReceived: 100,
      Invoices: [],
    });

    await processWebhookEvent("evt-myob-3");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
  });
});
