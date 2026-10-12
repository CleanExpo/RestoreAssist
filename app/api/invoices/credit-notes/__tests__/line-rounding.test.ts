/**
 * RA-7705: a credit-note line uses the invoice rule (round the line to cents
 * in decimal, then GST on the rounded line), and the header is the sum of
 * its lines. 0.69 x 2250c is 1553c; it used to persist 1552c.
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

const { creditNoteCreate } = vi.hoisted(() => ({
  creditNoteCreate: vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "cn_1",
      ...data,
    }),
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn().mockResolvedValue({ id: "inv_1", currency: "AUD" }),
    },
    creditNote: {
      count: vi.fn().mockResolvedValue(0),
      create: creditNoteCreate,
    },
  },
}));

import { POST } from "../route";

describe("POST /api/invoices/credit-notes: line amounts", () => {
  it("0.69 x 2250c at 10% persists line and header as 1553 + 155 = 1708", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/credit-notes", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: "inv_1",
          reason: "PRICING_ERROR",
          lineItems: [
            { description: "Labour", quantity: 0.69, unitPrice: 2250, gstRate: 10 },
          ],
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const data = creditNoteCreate.mock.calls[0][0].data as {
      subtotalExGST: number;
      gstAmount: number;
      totalIncGST: number;
      lineItems: {
        create: Array<{ subtotal: number; gstAmount: number; total: number }>;
      };
    };
    expect(data.lineItems.create[0]).toMatchObject({
      subtotal: 1553,
      gstAmount: 155,
      total: 1708,
    });
    expect([data.subtotalExGST, data.gstAmount, data.totalIncGST]).toEqual([
      1553, 155, 1708,
    ]);
  });
});
