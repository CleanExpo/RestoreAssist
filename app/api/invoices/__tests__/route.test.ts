import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// withIdempotency just runs the handler with the raw request body when no
// Idempotency-Key header is present. Stub it to that behaviour so the test
// exercises the financial-calculation path directly.
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    request: NextRequest,
    _userId: string,
    handler: (rawBody: string) => Promise<Response>,
  ) => request.text().then((body) => handler(body)),
}));

const txSequenceUpsert = vi.fn();
const txInvoiceCreate = vi.fn();
const txAuditCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) =>
      cb({
        invoiceSequence: { upsert: txSequenceUpsert },
        invoice: { create: txInvoiceCreate },
        invoiceAuditLog: { create: txAuditCreate },
      }),
    ),
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  txSequenceUpsert.mockResolvedValue({ prefix: "RA", lastNumber: 1 });
  txInvoiceCreate.mockImplementation(async (arg: any) => ({
    id: "inv_1",
    ...arg.data,
    lineItems: [],
  }));
});

const postReq = (body: unknown) =>
  new NextRequest("http://localhost/api/invoices", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("POST /api/invoices line-item unit-price rounding", () => {
  it("rounds fractional-cent unit prices instead of truncating", async () => {
    const res = await POST(
      postReq({
        customerName: "Acme",
        customerEmail: "acme@example.com",
        dueDate: "2026-01-31",
        // 1 x 1099.9 cents: parseInt truncated to 1099 (understated total).
        // Math.round(parseFloat(...)) rounds to 1100 cents (correct).
        lineItems: [{ description: "Drying", quantity: 1, unitPrice: 1099.9 }],
      }),
    );

    expect(res.status).toBe(201);
    expect(txInvoiceCreate).toHaveBeenCalledOnce();

    const data = txInvoiceCreate.mock.calls[0][0].data;
    expect(data.subtotalExGST).toBe(1100);
    expect(data.gstAmount).toBe(110);
    expect(data.totalIncGST).toBe(1210);
    expect(data.amountDue).toBe(1210);

    const persistedLineItem = data.lineItems.create[0];
    expect(persistedLineItem.unitPrice).toBe(1100);
    expect(persistedLineItem.subtotal).toBe(1100);
  });
});
