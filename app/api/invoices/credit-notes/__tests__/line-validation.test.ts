/**
 * RA-8398: a credit-note line with a negative or non-numeric quantity or
 * price, or a credit note with no lines, is rejected with a 400 that names
 * the line, and no credit note is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user_1", role: "ADMIN" }),
    },
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

function post(lineItems: unknown) {
  return POST(
    new NextRequest("http://localhost/api/invoices/credit-notes", {
      method: "POST",
      body: JSON.stringify({
        invoiceId: "inv_1",
        reason: "PRICING_ERROR",
        lineItems,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
}

const good = { description: "Labour", quantity: 1, unitPrice: 1000, gstRate: 10 };

describe("POST /api/invoices/credit-notes: line validation", () => {
  beforeEach(() => {
    creditNoteCreate.mockClear();
  });

  it.each([
    ["quantity -1", { ...good, quantity: -1 }, "quantity"],
    ['quantity "abc"', { ...good, quantity: "abc" }, "quantity"],
    ["unit price -5", { ...good, unitPrice: -5 }, "unitPrice"],
  ])("rejects %s on line 2 with a 400 and writes nothing", async (_l, bad, field) => {
    const res = await post([good, bad]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("Line item 2");
    expect(JSON.stringify(body)).toContain(`lineItems.1.${field}`);
    expect(creditNoteCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty lineItems list with a 400 and writes nothing", async () => {
    const res = await post([]);
    expect(res.status).toBe(400);
    expect(creditNoteCreate).not.toHaveBeenCalled();
  });

  it("still accepts a valid line", async () => {
    const res = await post([good]);
    expect(res.status).toBe(201);
    expect(creditNoteCreate).toHaveBeenCalledTimes(1);
  });

  it("stores a numeric-string quantity as a number (Float column)", async () => {
    const res = await post([{ ...good, quantity: "2" }]);
    expect(res.status).toBe(201);
    const data = creditNoteCreate.mock.calls[0][0].data as {
      lineItems: { create: Array<{ quantity: unknown }> };
    };
    expect(data.lineItems.create[0].quantity).toBe(2);
  });
});
