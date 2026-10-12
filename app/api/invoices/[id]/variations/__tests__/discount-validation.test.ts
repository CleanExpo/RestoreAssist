/**
 * RA-7705: the discount bound must use the same line maths the variation
 * persists. 0.69 h x $22.50 is $15.53 (decimal HALF_UP); the bound used to be
 * Math.round(0.69 * 2250) = 1552, so a full $15.53 discount was refused.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user_1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: NextRequest,
    _userId: string,
    handler: (raw: string) => Promise<Response>,
  ) => handler(await req.text()),
}));

const { invoiceCreate } = vi.hoisted(() => ({
  invoiceCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "var_1",
    ...data,
  })),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    invoiceSequence: {
      upsert: vi.fn().mockResolvedValue({ prefix: "RA", lastNumber: 2 }),
    },
    invoice: { create: invoiceCreate },
    invoiceAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    prisma: {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inv_1",
          invoiceNumber: "RA-2026-0001",
          originalInvoiceId: null,
          currency: "AUD",
          customerName: "Client",
          customerEmail: "client@example.com",
          lineItems: [{ id: "line_1", gstRate: 10 }],
        }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { POST } from "../route";

describe("POST /api/invoices/[id]/variations: discount bound", () => {
  it("accepts a full discount equal to the line's decimal-rounded subtotal (0.69 x $22.50 = $15.53)", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/inv_1/variations", {
        method: "POST",
        body: JSON.stringify({
          lineItems: [
            { description: "Labour", quantity: 0.69, unitPrice: 22.5, gstRate: 10 },
          ],
          discountAmount: "15.53",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "inv_1" }) },
    );

    expect(res.status).toBe(201);
    const data = invoiceCreate.mock.calls[0][0].data as {
      subtotalExGST: number;
      totalIncGST: number;
      lineItems: { create: Array<{ subtotal: number }> };
    };
    expect(data.lineItems.create[0].subtotal).toBe(1553);
    expect(data.subtotalExGST).toBe(0);
    expect(data.totalIncGST).toBe(0);
  });
});
