/**
 * RA-6984 — processQboMyobPendingPayments / retryUnresolvedQboMyobPayments
 *
 * These mirror processXeroWebhookBatch's atomic-claim batch shape, scoped to
 * QUICKBOOKS/MYOB payment events, since nothing currently drains them (unlike
 * XERO, which processWebhookEvent delegates to processXeroWebhookBatch
 * inline — see RA-6965). retryUnresolvedQboMyobPayments additionally
 * re-attempts events RA-6974/#1699 marked SKIPPED with an
 * "unresolvable stub" errorMessage, now that handlePaymentCreated resolves
 * the real amount via the provider API instead of trusting the webhook stub.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const webhookEventFindMany = vi.fn();
const webhookEventUpdateMany = vi.fn();
const webhookEventUpdate = vi.fn();
const invoiceFindFirst = vi.fn();
const integrationFindUnique = vi.fn();
const txInvoicePaymentCreate = vi.fn();
const txInvoiceUpdate = vi.fn();
const txInvoiceAuditLogCreate = vi.fn();
const txInvoicePaymentFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findMany: (...a: unknown[]) => webhookEventFindMany(...a),
      updateMany: (...a: unknown[]) => webhookEventUpdateMany(...a),
      update: (...a: unknown[]) => webhookEventUpdate(...a),
    },
    invoice: {
      findFirst: (...a: unknown[]) => invoiceFindFirst(...a),
    },
    integration: {
      findUnique: (...a: unknown[]) => integrationFindUnique(...a),
    },
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

vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: vi.fn(),
}));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi.fn(),
}));

const qboGetPayment = vi.fn();
const myobGetCustomerPayment = vi.fn();
vi.mock("@/lib/integrations/quickbooks/client", () => ({
  createQuickBooksClient: vi.fn(async () => ({
    getPayment: (...args: unknown[]) => qboGetPayment(...args),
  })),
}));
vi.mock("@/lib/integrations/myob/client", () => ({
  createMYOBClient: vi.fn(async () => ({
    getCustomerPayment: (...args: unknown[]) =>
      myobGetCustomerPayment(...args),
  })),
}));

import {
  processQboMyobPendingPayments,
  retryUnresolvedQboMyobPayments,
} from "../webhook-processor";

beforeEach(() => {
  vi.clearAllMocks();
  webhookEventUpdateMany.mockResolvedValue({ count: 1 });
  webhookEventUpdate.mockResolvedValue({});
  integrationFindUnique.mockResolvedValue({ userId: "user-1" });
  txInvoicePaymentFindFirst.mockResolvedValue(null); // no prior allocation by default
  txInvoicePaymentCreate.mockResolvedValue({ id: "pay-1" });
  txInvoiceUpdate.mockResolvedValue({
    amountPaid: 50000,
    amountDue: 0,
    totalIncGST: 50000,
  });
  txInvoiceAuditLogCreate.mockResolvedValue({});
});

describe("processQboMyobPendingPayments", () => {
  it("queries PENDING QUICKBOOKS/MYOB payment events with explicit select + take", async () => {
    webhookEventFindMany.mockResolvedValue([]);

    await processQboMyobPendingPayments(25);

    expect(webhookEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: { in: ["QUICKBOOKS", "MYOB"] },
          status: "PENDING",
        }),
        select: expect.any(Object),
        take: 25,
      }),
    );
  });

  it("resolves a claimed PENDING QuickBooks event via the API and marks it COMPLETED", async () => {
    webhookEventFindMany.mockResolvedValue([
      {
        id: "evt-1",
        provider: "QUICKBOOKS",
        integrationId: "integ-1",
        eventType: "payment.created",
        payload: { id: "qbo-pay-1" },
        retryCount: 0,
      },
    ]);
    qboGetPayment.mockResolvedValue({
      Id: "qbo-pay-1",
      TotalAmt: 250,
      TxnDate: "2026-07-01",
      Line: [
        {
          Amount: 250,
          LinkedTxn: [{ TxnId: "qbo-inv-1", TxnType: "Invoice" }],
        },
      ],
    });
    invoiceFindFirst.mockResolvedValue({
      id: "local-1",
      currency: "AUD",
      userId: "user-1",
    });

    const result = await processQboMyobPendingPayments(50);

    expect(webhookEventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-1", status: "PENDING" },
        data: { status: "PROCESSING" },
      }),
    );
    expect(webhookEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0 });
  });

  it("skips an event that another worker already claimed (CAS race)", async () => {
    webhookEventFindMany.mockResolvedValue([
      {
        id: "evt-2",
        provider: "MYOB",
        integrationId: "integ-2",
        eventType: "payment.created",
        payload: {},
        retryCount: 0,
      },
    ]);
    webhookEventUpdateMany.mockResolvedValue({ count: 0 });

    const result = await processQboMyobPendingPayments(50);

    expect(myobGetCustomerPayment).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, failed: 0, skipped: 1 });
  });

  it("marks a resolution failure FAILED once retryCount reaches the bound", async () => {
    webhookEventFindMany.mockResolvedValue([
      {
        id: "evt-3",
        provider: "QUICKBOOKS",
        integrationId: "integ-3",
        eventType: "payment.created",
        payload: { id: "qbo-pay-3" },
        retryCount: 4,
      },
    ]);
    qboGetPayment.mockRejectedValue(new Error("QBO API 500"));

    const result = await processQboMyobPendingPayments(50);

    expect(webhookEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-3" },
        data: expect.objectContaining({ status: "FAILED", retryCount: 5 }),
      }),
    );
    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0 });
  });
});

describe("retryUnresolvedQboMyobPayments", () => {
  it("queries SKIPPED events by the RA-6974/#1699 errorMessage markers with explicit select + take", async () => {
    webhookEventFindMany.mockResolvedValue([]);

    await retryUnresolvedQboMyobPayments(25);

    expect(webhookEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: { in: ["QUICKBOOKS", "MYOB"] },
          status: "SKIPPED",
          errorMessage: {
            in: expect.arrayContaining([
              expect.stringContaining(
                "QuickBooks payment CDC notification has no LinkedTxn/TotalAmt",
              ),
              expect.stringContaining(
                "MYOB payment notification is a CDC stub with no Amount/InvoiceUID",
              ),
            ]),
          },
        }),
        select: expect.any(Object),
        take: 25,
      }),
    );
  });

  it("resolves a retroactive MYOB stub and marks it COMPLETED", async () => {
    webhookEventFindMany.mockResolvedValue([
      {
        id: "evt-skip-1",
        provider: "MYOB",
        integrationId: "integ-4",
        eventType: "payment.created",
        payload: {
          ResourceUID: "myob-pay-9",
          ResourceType: "Sale.CustomerPayment",
        },
        retryCount: 0,
      },
    ]);
    myobGetCustomerPayment.mockResolvedValue({
      UID: "myob-pay-9",
      Date: "2026-07-01",
      AmountReceived: 800,
      Invoices: [{ UID: "myob-inv-9", AmountApplied: 800 }],
    });
    invoiceFindFirst.mockResolvedValue({
      id: "local-9",
      currency: "AUD",
      userId: "user-9",
    });

    const result = await retryUnresolvedQboMyobPayments(50);

    expect(webhookEventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-skip-1", status: "SKIPPED" },
        data: { status: "PROCESSING" },
      }),
    );
    expect(webhookEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-skip-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0 });
  });

  it("on a transient failure restores the ORIGINAL provider stub marker (never the new error) and increments retryCount so the event stays eligible next run", async () => {
    webhookEventFindMany.mockResolvedValue([
      {
        id: "evt-skip-2",
        provider: "QUICKBOOKS",
        integrationId: "integ-5",
        eventType: "payment.created",
        payload: { id: "qbo-pay-void" },
        retryCount: 0,
      },
    ]);
    // A transient 429/timeout — the exact class that RA-6974 orphaned forever.
    qboGetPayment.mockRejectedValue(new Error("QBO API 429 rate limited"));

    const result = await retryUnresolvedQboMyobPayments(50);

    expect(webhookEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-skip-2" },
        data: expect.objectContaining({
          status: "SKIPPED",
          retryCount: 1,
          // The ORIGINAL QBO marker is restored so the errorMessage `in`
          // filter re-selects it; overwriting it with the 429 would drop it
          // out of the filter permanently (the RA-6974 pathology).
          errorMessage:
            "QuickBooks payment CDC notification has no LinkedTxn/TotalAmt - cannot resolve a settled payment from the webhook payload alone",
        }),
      }),
    );
    const call = webhookEventUpdate.mock.calls.find(
      (c) => (c[0] as { where?: { id?: string } })?.where?.id === "evt-skip-2",
    );
    expect(
      (call?.[0] as { data?: { errorMessage?: string } })?.data?.errorMessage,
    ).not.toContain("429");
    expect(result).toEqual({ processed: 0, failed: 0, skipped: 1 });
  });

  it("transitions a retroactive event to FAILED (visible to monitoring) once retryCount reaches the bound", async () => {
    webhookEventFindMany.mockResolvedValue([
      {
        id: "evt-skip-3",
        provider: "MYOB",
        integrationId: "integ-6",
        eventType: "payment.created",
        payload: { ResourceUID: "myob-pay-dead" },
        retryCount: 4,
      },
    ]);
    myobGetCustomerPayment.mockRejectedValue(
      new Error("integration disconnected"),
    );

    const result = await retryUnresolvedQboMyobPayments(50);

    expect(webhookEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-skip-3" },
        data: expect.objectContaining({ status: "FAILED", retryCount: 5 }),
      }),
    );
    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0 });
  });
});
