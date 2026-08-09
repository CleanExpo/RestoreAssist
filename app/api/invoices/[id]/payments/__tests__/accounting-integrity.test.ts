import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const requireAddon = vi.fn();
const transaction = vi.fn();
const tx = vi.hoisted(() => ({
  invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
  invoicePayment: { create: vi.fn() },
  invoicePaymentAllocation: { create: vi.fn() },
  invoiceAuditLog: { create: vi.fn() },
}));

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/entitlements", () => ({
  requireAddon: (...args: unknown[]) => requireAddon(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import { POST } from "../route";

function request(amount: number) {
  return new NextRequest("http://localhost/api/invoices/invoice_1/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      paymentMethod: "BANK_TRANSFER",
      reference: "BANK-123",
    }),
  });
}

const params = { params: Promise.resolve({ id: "invoice_1" }) };

function invoice(amountPaid: number, amountDue: number) {
  return {
    id: "invoice_1",
    userId: "user_1",
    status: amountDue === 10_000 ? "SENT" : "PARTIALLY_PAID",
    currency: "AUD",
    totalIncGST: 10_000,
    amountPaid,
    amountDue,
    paidDate: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  requireAddon.mockResolvedValue({
    allowed: true,
    sku: "PAYMENTS",
    workspaceId: "workspace_1",
  });
  transaction.mockImplementation(
    async (handler: (transactionClient: typeof tx) => Promise<unknown>) =>
      handler(tx),
  );
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.invoicePayment.create.mockResolvedValue({ id: "payment_1" });
  tx.invoicePaymentAllocation.create.mockResolvedValue({ id: "allocation_1" });
  tx.invoiceAuditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("POST /api/invoices/[id]/payments — accounting integrity", () => {
  it("records payment, allocation, and invoice totals in one serializable transaction", async () => {
    tx.invoice.findUnique
      .mockResolvedValueOnce(invoice(0, 10_000))
      .mockResolvedValueOnce({
        ...invoice(4_000, 6_000),
        lineItems: [],
        payments: [{ id: "payment_1" }],
      });

    const response = await POST(request(4_000), params);

    expect(response.status).toBe(201);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invoice_1",
        userId: "user_1",
        amountPaid: 0,
        amountDue: 10_000,
      },
      data: {
        amountPaid: 4_000,
        amountDue: 6_000,
        status: "PARTIALLY_PAID",
        paidDate: null,
      },
    });
    expect(tx.invoicePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 4_000,
        currency: "AUD",
        invoiceId: "invoice_1",
        userId: "user_1",
        reconciled: false,
      }),
    });
    expect(tx.invoicePaymentAllocation.create).toHaveBeenCalledWith({
      data: {
        paymentId: "payment_1",
        invoiceId: "invoice_1",
        allocatedAmount: 4_000,
      },
    });
  });

  it("rejects an over-allocation before creating ledger rows", async () => {
    tx.invoice.findUnique.mockResolvedValueOnce(invoice(6_000, 4_000));

    const response = await POST(request(5_000), params);

    expect(response.status).toBe(400);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
  });

  it("fails closed when the stored invoice balance is inconsistent", async () => {
    tx.invoice.findUnique.mockResolvedValueOnce(invoice(4_000, 5_000));

    const response = await POST(request(1_000), params);

    expect(response.status).toBe(409);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
  });

  it("retries a lost CAS and rejects against the fresh concurrent balance", async () => {
    tx.invoice.findUnique
      .mockResolvedValueOnce(invoice(0, 10_000))
      .mockResolvedValueOnce(invoice(6_000, 4_000));
    tx.invoice.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request(5_000), params);

    expect(response.status).toBe(400);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.invoice.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
  });

  it("returns a conflict after repeated concurrent balance changes", async () => {
    tx.invoice.findUnique.mockResolvedValue(invoice(0, 10_000));
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(5_000), params);

    expect(response.status).toBe(409);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
  });
});
