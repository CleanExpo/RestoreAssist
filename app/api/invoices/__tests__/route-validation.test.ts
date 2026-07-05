import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// No Idempotency-Key header is sent, so withIdempotency passes straight
// through to the handler — the real implementation is fine here.

const {
  txSequenceUpsert,
  txInvoiceCreate,
  txAuditCreate,
  invoiceFindFirst,
  sequenceUpsert,
  $transaction,
} = vi.hoisted(() => ({
  txSequenceUpsert: vi.fn(),
  txInvoiceCreate: vi.fn(),
  txAuditCreate: vi.fn(),
  invoiceFindFirst: vi.fn(),
  sequenceUpsert: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findFirst: invoiceFindFirst },
    invoiceSequence: { upsert: sequenceUpsert },
    $transaction,
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  txSequenceUpsert.mockResolvedValue({ prefix: "RA", lastNumber: 1 });
  txAuditCreate.mockResolvedValue({});
  $transaction.mockImplementation(async (cb: any) =>
    cb({
      invoiceSequence: { upsert: txSequenceUpsert },
      invoice: { create: txInvoiceCreate },
      invoiceAuditLog: { create: txAuditCreate },
    }),
  );
});

const postReq = (body: unknown) =>
  new NextRequest("http://localhost/api/invoices", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const validBase = {
  customerName: "Acme",
  customerEmail: "a@acme.test",
  dueDate: "2026-08-01",
};

describe("POST /api/invoices numeric validation", () => {
  it("rejects non-numeric quantity with 400 and does NOT persist", async () => {
    const res = await POST(
      postReq({
        ...validBase,
        lineItems: [{ description: "Drying", quantity: "abc", unitPrice: 10000 }],
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(txInvoiceCreate).not.toHaveBeenCalled();
  });

  it("rejects missing unitPrice with 400 and does NOT persist", async () => {
    const res = await POST(
      postReq({
        ...validBase,
        lineItems: [{ description: "Drying", quantity: 2 }],
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("rejects negative quantity with 400", async () => {
    const res = await POST(
      postReq({
        ...validBase,
        lineItems: [{ description: "Drying", quantity: -1, unitPrice: 10000 }],
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a discountAmount larger than the subtotal with 400", async () => {
    const res = await POST(
      postReq({
        ...validBase,
        lineItems: [{ description: "Drying", quantity: 1, unitPrice: 10000 }],
        discountAmount: 999999,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a discountPercentage above 100 with 400", async () => {
    const res = await POST(
      postReq({
        ...validBase,
        lineItems: [{ description: "Drying", quantity: 1, unitPrice: 10000 }],
        discountPercentage: 150,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("accepts valid line items and persists correct, finite totals", async () => {
    let captured: any;
    txInvoiceCreate.mockImplementation(async (arg: any) => {
      captured = arg;
      return { id: "inv_1", ...arg.data, lineItems: [] };
    });

    const res = await POST(
      postReq({
        ...validBase,
        // qty 2 x $100.00 (10000 cents) = 20000 ex GST, GST 2000, total 22000.
        lineItems: [{ description: "Drying", quantity: 2, unitPrice: 10000 }],
      }),
    );

    expect(res.status).toBe(201);
    expect(p.$transaction).toHaveBeenCalledOnce();

    const data = captured.data;
    expect(data.subtotalExGST).toBe(20000);
    expect(data.gstAmount).toBe(2000);
    expect(data.totalIncGST).toBe(22000);
    expect(data.amountDue).toBe(22000);
    for (const v of [
      data.subtotalExGST,
      data.gstAmount,
      data.totalIncGST,
      data.amountDue,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
