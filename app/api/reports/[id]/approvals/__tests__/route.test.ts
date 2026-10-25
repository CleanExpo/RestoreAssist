import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8068: ReportApproval is unique per (reportId, approvalType), so a revised
// quote must reset the existing row to PENDING rather than create a second one
// (which fails with P2002 and leaves the restorer unable to re-request).

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportFinancialReach: vi.fn(),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _key: string,
    cb: (raw: string) => Promise<unknown>,
  ) => cb(await request.text()),
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

const reportFindFirst = vi.fn();
const approvalUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
    reportApproval: {
      upsert: (...a: unknown[]) => approvalUpsert(...a),
    },
  },
}));

import { POST } from "../route";

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/reports/r_1/approvals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: "r_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  approvalUpsert.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("POST /api/reports/[id]/approvals", () => {
  it("returns 404 when the report is not the restorer's", async () => {
    reportFindFirst.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ approvalType: "COST_ESTIMATE", amount: 5000 }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(approvalUpsert).not.toHaveBeenCalled();
  });

  it("resets an existing approval to PENDING with the new amount", async () => {
    reportFindFirst.mockResolvedValueOnce({ id: "r_1", userId: "user_1" });
    approvalUpsert.mockResolvedValueOnce({
      id: "ap_1",
      status: "PENDING",
      amount: 9000,
    });

    const res = await POST(
      postReq({ approvalType: "COST_ESTIMATE", amount: 9000 }),
      ctx,
    );

    expect(res.status).toBe(201);
    const args = approvalUpsert.mock.calls[0][0];
    expect(args.where).toEqual({
      reportId_approvalType: { reportId: "r_1", approvalType: "COST_ESTIMATE" },
    });
    expect(args.create).toMatchObject({
      reportId: "r_1",
      approvalType: "COST_ESTIMATE",
      status: "PENDING",
      amount: 9000,
    });
    expect(args.update).toMatchObject({
      status: "PENDING",
      amount: 9000,
      respondedAt: null,
      clientComments: null,
    });
    expect(args.update.requestedAt).toBeInstanceOf(Date);
  });

  it("rejects a negative amount before touching the database", async () => {
    const res = await POST(
      postReq({ approvalType: "COST_ESTIMATE", amount: -1 }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(approvalUpsert).not.toHaveBeenCalled();
  });
});
