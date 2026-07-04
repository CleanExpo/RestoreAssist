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
const txInvoicePaymentFindFirst = vi.fn();

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
        invoicePayment: {
          create: txInvoicePaymentCreate,
          findFirst: txInvoicePaymentFindFirst,
        },
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
  // RA-6984 — QBO/MYOB payment recording resolves the integration's owning
  // userId to scope the invoice lookup (cross-tenant guard). Default to a
  // resolvable tenant; the XERO delegation test overrides with its own shape.
  mockFindUniqueIntegration.mockResolvedValue({ userId: "user-x" });
  // RA-6984 F1 — per-allocation idempotency guard: default to "no prior
  // allocation recorded" so the create path runs; tests re-recording a payment
  // override this to return an existing row.
  txInvoicePaymentFindFirst.mockResolvedValue(null);
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

  // RA-6984 CRITICAL — QBO TxnIds are per-realm sequential integers and the
  // Invoice (externalSyncProvider, externalInvoiceId) unique key is GLOBAL, so
  // an unscoped lookup could resolve a DIFFERENT tenant's invoice. The lookup
  // MUST be scoped to the integration's owning userId.
  it("scopes the invoice lookup to the integration's owning userId (cross-tenant corruption guard)", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-scope",
      provider: "QUICKBOOKS",
      integrationId: "integ-tenant-a",
      eventType: "payment.created",
      payload: { id: "qbo-pay-scope" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-tenant-a" },
    });
    mockFindUniqueIntegration.mockResolvedValue({ userId: "tenant-a" });
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-scope",
      TotalAmt: 300,
      TxnDate: "2026-07-01",
      // TxnId "145" — a value another realm could equally mint.
      Line: [{ Amount: 300, LinkedTxn: [{ TxnId: "145", TxnType: "Invoice" }] }],
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "inv-a",
      currency: "AUD",
      userId: "tenant-a",
    });
    txInvoicePaymentCreate.mockResolvedValue({ id: "pay-scope" });
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 30000,
      amountDue: 0,
      totalIncGST: 30000,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-qbo-scope");

    expect(mockFindUniqueIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "integ-tenant-a" } }),
    );
    expect(mockFindFirstInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalInvoiceId: "145",
          externalSyncProvider: "QUICKBOOKS",
          userId: "tenant-a",
        }),
      }),
    );
  });

  it("skips recording (no unscoped invoice lookup) when the owning integration cannot be resolved", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-noint",
      provider: "QUICKBOOKS",
      integrationId: "integ-gone",
      eventType: "payment.created",
      payload: { id: "qbo-pay-noint" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-gone" },
    });
    mockFindUniqueIntegration.mockResolvedValue(null);
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-noint",
      TotalAmt: 100,
      TxnDate: "2026-07-01",
      Line: [{ Amount: 100, LinkedTxn: [{ TxnId: "1", TxnType: "Invoice" }] }],
    });

    await processWebhookEvent("evt-qbo-noint");

    expect(mockFindFirstInvoice).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
  });

  // RA-6984 — a payment split across invoices must credit each invoice its OWN
  // line Amount, not the whole TotalAmt to the first invoice.
  it("allocates each LinkedTxn its own line Amount across multiple invoices", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-multi",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      payload: { id: "qbo-pay-multi" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-q" },
    });
    mockFindUniqueIntegration.mockResolvedValue({ userId: "user-q" });
    // One $300 payment split $200 → invoice A, $100 → invoice B.
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-multi",
      TotalAmt: 300,
      TxnDate: "2026-07-01",
      Line: [
        { Amount: 200, LinkedTxn: [{ TxnId: "inv-a", TxnType: "Invoice" }] },
        { Amount: 100, LinkedTxn: [{ TxnId: "inv-b", TxnType: "Invoice" }] },
      ],
    });
    mockFindFirstInvoice
      .mockResolvedValueOnce({ id: "local-a", currency: "AUD", userId: "user-q" })
      .mockResolvedValueOnce({ id: "local-b", currency: "AUD", userId: "user-q" });
    txInvoicePaymentCreate
      .mockResolvedValueOnce({ id: "pay-a" })
      .mockResolvedValueOnce({ id: "pay-b" });
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 20000,
      amountDue: 0,
      totalIncGST: 20000,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-qbo-multi");

    expect(txInvoicePaymentCreate).toHaveBeenCalledTimes(2);
    expect(txInvoicePaymentCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 20000, // $200 → cents, invoice A's OWN line amount
          invoiceId: "local-a",
          externalPaymentId: "qbo-pay-multi",
        }),
      }),
    );
    expect(txInvoicePaymentCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 10000, // $100 → cents, invoice B's OWN line amount
          invoiceId: "local-b",
          externalPaymentId: "qbo-pay-multi",
        }),
      }),
    );
  });

  // RA-6984 F2 — cents must be Math.round(amount * 100), not Math.round(amount) * 100.
  it("converts a fractional-dollar line amount to exact cents", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-frac",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      payload: { id: "qbo-pay-frac" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-q" },
    });
    mockFindUniqueIntegration.mockResolvedValue({ userId: "user-q" });
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-frac",
      TotalAmt: 123.45,
      TxnDate: "2026-07-01",
      Line: [{ Amount: 123.45, LinkedTxn: [{ TxnId: "inv-f", TxnType: "Invoice" }] }],
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-f",
      currency: "AUD",
      userId: "user-q",
    });
    txInvoicePaymentCreate.mockResolvedValue({ id: "pay-f" });
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 12345,
      amountDue: 0,
      totalIncGST: 12345,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-qbo-frac");

    expect(txInvoicePaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 12345 }), // $123.45 → 12345 cents
      }),
    );
  });

  // RA-6984 F1 — a retried multi-invoice payment must not re-credit an invoice
  // whose allocation already committed on a prior run (externalPaymentId has no
  // DB unique constraint, so this in-tx existence check is the only guard).
  it("skips an allocation already recorded for this (payment, invoice) — no double-credit on retry", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-qbo-retry",
      provider: "QUICKBOOKS",
      integrationId: "integ-q",
      eventType: "payment.created",
      payload: { id: "qbo-pay-retry" },
      status: "PENDING",
      retryCount: 1,
      integration: { id: "integ-q" },
    });
    mockFindUniqueIntegration.mockResolvedValue({ userId: "user-q" });
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-retry",
      TotalAmt: 200,
      TxnDate: "2026-07-01",
      Line: [{ Amount: 200, LinkedTxn: [{ TxnId: "inv-r", TxnType: "Invoice" }] }],
    });
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-r",
      currency: "AUD",
      userId: "user-q",
    });
    // The prior run already recorded this allocation.
    txInvoicePaymentFindFirst.mockResolvedValue({ id: "pay-existing" });

    await processWebhookEvent("evt-qbo-retry");

    // No new payment row, no balance increment — the retry is a no-op credit.
    expect(txInvoicePaymentCreate).not.toHaveBeenCalled();
    expect(txInvoiceUpdate).not.toHaveBeenCalled();
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

  // RA-6984 — MYOB credits each applied invoice its OWN AmountApplied, not the
  // whole AmountReceived to Invoices[0].
  it("allocates each applied invoice its own AmountApplied across multiple invoices", async () => {
    mockFindUniqueEvent.mockResolvedValue({
      id: "evt-myob-multi",
      provider: "MYOB",
      integrationId: "integ-m",
      eventType: "payment.created",
      payload: { ResourceUID: "myob-pay-multi" },
      status: "PENDING",
      retryCount: 0,
      integration: { id: "integ-m" },
    });
    mockFindUniqueIntegration.mockResolvedValue({ userId: "user-m" });
    // One $900 payment split $600 → invoice A, $300 → invoice B.
    myobGetCustomerPayment.mockResolvedValue({
      UID: "myob-pay-multi",
      Date: "2026-07-01T00:00:00",
      AmountReceived: 900,
      Invoices: [
        { UID: "minv-a", Number: "INV-A", AmountApplied: 600 },
        { UID: "minv-b", Number: "INV-B", AmountApplied: 300 },
      ],
    });
    mockFindFirstInvoice
      .mockResolvedValueOnce({ id: "mlocal-a", currency: "AUD", userId: "user-m" })
      .mockResolvedValueOnce({ id: "mlocal-b", currency: "AUD", userId: "user-m" });
    txInvoicePaymentCreate
      .mockResolvedValueOnce({ id: "mpay-a" })
      .mockResolvedValueOnce({ id: "mpay-b" });
    txInvoiceUpdate.mockResolvedValue({
      amountPaid: 60000,
      amountDue: 0,
      totalIncGST: 60000,
    });
    txInvoiceAuditLogCreate.mockResolvedValue({});

    await processWebhookEvent("evt-myob-multi");

    expect(txInvoicePaymentCreate).toHaveBeenCalledTimes(2);
    expect(txInvoicePaymentCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 60000, // $600 → cents, invoice A's OWN applied amount
          invoiceId: "mlocal-a",
          externalPaymentId: "myob-pay-multi",
        }),
      }),
    );
    expect(txInvoicePaymentCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 30000, // $300 → cents, invoice B's OWN applied amount
          invoiceId: "mlocal-b",
          externalPaymentId: "myob-pay-multi",
        }),
      }),
    );
  });
});
