import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit-log", () => ({ recordMutationAudit: vi.fn() }));

const txInvoiceUpdate = vi.fn();
const txLineItemDeleteMany = vi.fn();
const txAuditCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) =>
      cb({
        invoiceLineItem: { deleteMany: txLineItemDeleteMany },
        invoice: { update: txInvoiceUpdate },
        invoiceAuditLog: { create: txAuditCreate },
      }),
    ),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PUT } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  invoice: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  // Existing DRAFT invoice owned by the user.
  p.invoice.findUnique.mockResolvedValue({
    id: "inv_1",
    userId: "u_1",
    status: "DRAFT",
    invoiceNumber: "INV-0001",
  });
});

const putReq = (body: unknown) =>
  new NextRequest("http://localhost/api/invoices/inv_1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const params = Promise.resolve({ id: "inv_1" });

describe("PUT /api/invoices/[id] line-item numeric validation", () => {
  it("rejects non-numeric quantity with 400 and does NOT persist", async () => {
    const res = await PUT(putReq({
      lineItems: [{ description: "Drying", quantity: "abc", unitPrice: 10000 }],
    }), { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION");
    // Invoice never written — no corruption.
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(txInvoiceUpdate).not.toHaveBeenCalled();
  });

  it("rejects missing unitPrice with 400 and does NOT persist", async () => {
    const res = await PUT(putReq({
      lineItems: [{ description: "Drying", quantity: 2 }],
    }), { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("rejects negative quantity with 400", async () => {
    const res = await PUT(putReq({
      lineItems: [{ description: "Drying", quantity: -1, unitPrice: 10000 }],
    }), { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION");
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("accepts valid line items and persists correct, finite totals", async () => {
    let captured: any;
    txInvoiceUpdate.mockImplementation(async (arg: any) => {
      captured = arg;
      return { id: "inv_1", ...arg.data, lineItems: [] };
    });

    const res = await PUT(putReq({
      // qty 2 x $100.00 (10000 cents) = 20000 ex GST, GST 2000, total 22000.
      lineItems: [{ description: "Drying", quantity: 2, unitPrice: 10000 }],
    }), { params });

    expect(res.status).toBe(200);
    expect(p.$transaction).toHaveBeenCalledOnce();

    const data = captured.data;
    expect(data.subtotalExGST).toBe(20000);
    expect(data.gstAmount).toBe(2000);
    expect(data.totalIncGST).toBe(22000);
    expect(data.amountDue).toBe(22000);
    // No NaN anywhere in the persisted totals.
    for (const v of [data.subtotalExGST, data.gstAmount, data.totalIncGST, data.amountDue]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("scales per-item GST on discount instead of recomputing at flat 10% for mixed-rate items", async () => {
    let captured: any;
    txInvoiceUpdate.mockImplementation(async (arg: any) => {
      captured = arg;
      return { id: "inv_1", ...arg.data, lineItems: [] };
    });

    const res = await PUT(putReq({
      lineItems: [
        // GST-free item: $100.00 ex GST, 0 GST.
        { description: "GST-free labour", quantity: 1, unitPrice: 10000, gstRate: 0 },
        // Standard-rated item: $100.00 ex GST, $10.00 GST.
        { description: "Materials", quantity: 1, unitPrice: 10000, gstRate: 10 },
      ],
      // 10% off the $200.00 ex-GST subtotal.
      discountPercentage: 10,
    }), { params });

    expect(res.status).toBe(200);
    const data = captured.data;
    // Subtotal 20000 - 2000 discount = 18000.
    expect(data.subtotalExGST).toBe(18000);
    // Accumulated GST was 1000 (only the standard item). Scaled by 18000/20000 = 900.
    // A flat-10%-of-subtotal recompute would wrongly yield 1800.
    expect(data.gstAmount).toBe(900);
    expect(data.totalIncGST).toBe(18900);
    expect(data.amountDue).toBe(18900);
  });
});
