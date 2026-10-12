/**
 * RA-7705: a recurring template's totals use the invoice rule (round each
 * line to cents in decimal, then GST on the rounded line). 0.69 x 2250c is
 * 1553c; the template used to store 1552c.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getGstTreatment } from "@/lib/gst-rules";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user_1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
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

describe("POST /api/invoices/recurring: template totals", () => {
  it("0.69 x 2250c at 10% stores 1553 + 155 = 1708", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/recurring", {
        method: "POST",
        body: JSON.stringify({
          templateName: "Monthly",
          customerName: "Client",
          customerEmail: "client@example.com",
          frequency: "MONTHLY",
          startDate: "2026-10-01",
          lineItems: [
            { description: "Labour", quantity: 0.69, unitPrice: 2250, gstRate: 10 },
          ],
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const data = recurringCreate.mock.calls[0][0].data as {
      subtotalExGST: number;
      gstAmount: number;
      totalIncGST: number;
    };
    expect([data.subtotalExGST, data.gstAmount, data.totalIncGST]).toEqual([
      1553, 155, 1708,
    ]);
  });
});
