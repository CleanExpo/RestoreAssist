/**
 * RA-8398: a recurring template line with a negative or non-numeric quantity
 * or price is rejected with a 400 that names the line, and no template is
 * written. Also: extra keys on a line are not stored, and a bad start date
 * or frequency is a 400, not an Invalid Date or a database error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getGstTreatment } from "@/lib/gst-rules";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user_1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertFinancialWriter: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { id: "user_1", role: "ADMIN" } }),
  canLinkRecord: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/gst/resolve-user-gst", () => ({
  resolveUserGstTreatment: vi.fn(async () => getGstTreatment("AU")),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: NextRequest,
    _userId: string,
    handler: (raw: string) => Promise<Response>,
  ) => handler(await req.text()),
}));

const { recurringCreate } = vi.hoisted(() => ({
  recurringCreate: vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "rec_1",
      ...data,
    }),
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { recurringInvoice: { create: recurringCreate } },
}));

import { POST } from "../route";

function post(overrides: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/invoices/recurring", {
      method: "POST",
      body: JSON.stringify({
        templateName: "Monthly",
        customerName: "Client",
        customerEmail: "client@example.com",
        frequency: "MONTHLY",
        startDate: "2026-10-01",
        lineItems: [good],
        ...overrides,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
}

const good = { description: "Labour", quantity: 1, unitPrice: 1000, gstRate: 10 };

describe("POST /api/invoices/recurring: line validation", () => {
  beforeEach(() => {
    recurringCreate.mockClear();
  });

  it.each([
    ["quantity -1", { ...good, quantity: -1 }, "quantity"],
    ['quantity "abc"', { ...good, quantity: "abc" }, "quantity"],
    ["unit price -5", { ...good, unitPrice: -5 }, "unitPrice"],
  ])("rejects %s on line 2 with a 400 and writes nothing", async (_l, bad, field) => {
    const res = await post({ lineItems: [good, bad] });
    expect(res.status).toBe(400);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("Line item 2");
    expect(body).toContain(`lineItems.1.${field}`);
    expect(recurringCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty lineItems list with a 400", async () => {
    const res = await post({ lineItems: [] });
    expect(res.status).toBe(400);
    expect(recurringCreate).not.toHaveBeenCalled();
  });

  it("rejects an invalid start date and an unknown frequency with a 400", async () => {
    expect((await post({ startDate: "not-a-date" })).status).toBe(400);
    expect((await post({ frequency: "HOURLY" })).status).toBe(400);
    expect(recurringCreate).not.toHaveBeenCalled();
  });

  it("stores only the template fields of each line", async () => {
    const res = await post({ lineItems: [{ ...good, injected: "x" }] });
    expect(res.status).toBe(201);
    const data = recurringCreate.mock.calls[0][0].data as {
      lineItemsTemplate: Array<Record<string, unknown>>;
    };
    expect(data.lineItemsTemplate[0]).not.toHaveProperty("injected");
    expect(data.lineItemsTemplate[0]).toMatchObject({
      description: "Labour",
      quantity: 1,
      unitPrice: 1000,
      gstRate: 10,
    });
  });
});
