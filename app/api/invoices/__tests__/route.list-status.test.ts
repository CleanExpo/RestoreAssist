import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// RA-7567 — the credit-note picker asks for SENT+PAID in one query value.
// Passing that string through to Prisma as a single InvoiceStatus 500s.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const invoiceFindMany = vi.fn();
const invoiceCount = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
      count: (...a: unknown[]) => invoiceCount(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: opts.message }), {
      status: opts.status,
      headers: { "content-type": "application/json" },
    }),
  fromException: () =>
    new Response(JSON.stringify({ error: "server" }), { status: 500 }),
}));

import { GET } from "../route";

function getReq(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/invoices${qs}`);
}

beforeEach(() => {
  getServerSession.mockReset();
  invoiceFindMany.mockReset();
  invoiceCount.mockReset();
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue({ role: "USER", organizationId: null });
});

describe("GET /api/invoices status filter (RA-7567)", () => {
  it("filters a single status as an equality", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    invoiceFindMany.mockResolvedValueOnce([]);
    invoiceCount.mockResolvedValueOnce(0);

    const res = await GET(getReq("?status=SENT"));
    expect(res.status).toBe(200);

    const whereArg = invoiceFindMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("SENT");
  });

  it("parses a comma-joined status list as { in: [...] }", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    invoiceFindMany.mockResolvedValueOnce([]);
    invoiceCount.mockResolvedValueOnce(0);

    const res = await GET(getReq("?status=SENT,PAID&limit=100"));
    expect(res.status).toBe(200);

    const whereArg = invoiceFindMany.mock.calls[0][0].where;
    expect(whereArg.status).toEqual({ in: ["SENT", "PAID"] });
  });

  it("returns 400 for an unknown invoice status instead of querying Prisma", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });

    const res = await GET(getReq("?status=NOT_A_STATUS"));
    expect(res.status).toBe(400);
    expect(invoiceFindMany).not.toHaveBeenCalled();
    expect(invoiceCount).not.toHaveBeenCalled();
  });
});
