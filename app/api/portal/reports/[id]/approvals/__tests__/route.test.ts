import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T10 — insurer/client report approvals (Linda, portal). Locks the
// client-only auth, input validation, tenant-scoped report ownership, and the
// find-or-create upsert that records an APPROVED/REJECTED decision.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
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
const approvalFindFirst = vi.fn();
const approvalCreate = vi.fn();
const approvalUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
    reportApproval: {
      findFirst: (...a: unknown[]) => approvalFindFirst(...a),
      create: (...a: unknown[]) => approvalCreate(...a),
      update: (...a: unknown[]) => approvalUpdate(...a),
    },
  },
}));

import { POST } from "../route";

const clientSession = {
  user: { id: "u_c", userType: "client", clientId: "c_1" },
};
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/portal/reports/r_1/approvals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: "r_1" }) };
const approve = { approvalType: "SCOPE_OF_WORK", status: "APPROVED" };

beforeEach(() => {
  getServerSession.mockReset();
  reportFindFirst.mockReset();
  approvalFindFirst.mockReset();
  approvalCreate.mockReset();
  approvalUpdate.mockReset();
  getServerSession.mockResolvedValue(clientSession);
});

describe("POST /api/portal/reports/[id]/approvals", () => {
  it("returns 401 for a non-client session", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", userType: "user" } });
    const res = await POST(postReq(approve), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid approval type", async () => {
    const res = await POST(postReq({ approvalType: "BOGUS", status: "APPROVED" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid status", async () => {
    const res = await POST(
      postReq({ approvalType: "SCOPE_OF_WORK", status: "MAYBE" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the report does not belong to the client", async () => {
    reportFindFirst.mockResolvedValueOnce(null);
    const res = await POST(postReq(approve), ctx);
    expect(res.status).toBe(404);
    expect(reportFindFirst.mock.calls[0][0].where).toMatchObject({
      id: "r_1",
      clientId: "c_1",
    });
  });

  it("creates a new approval when none is pending", async () => {
    reportFindFirst.mockResolvedValueOnce({ id: "r_1", clientId: "c_1" });
    approvalFindFirst.mockResolvedValueOnce(null);
    approvalCreate.mockResolvedValueOnce({ id: "ap_1", status: "APPROVED" });

    const res = await POST(postReq(approve), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.approval.id).toBe("ap_1");
    expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
      reportId: "r_1",
      approvalType: "SCOPE_OF_WORK",
      status: "APPROVED",
    });
    expect(approvalUpdate).not.toHaveBeenCalled();
  });

  it("updates the existing pending approval instead of duplicating it", async () => {
    reportFindFirst.mockResolvedValueOnce({ id: "r_1", clientId: "c_1" });
    approvalFindFirst.mockResolvedValueOnce({ id: "ap_old" });
    approvalUpdate.mockResolvedValueOnce({ id: "ap_old", status: "REJECTED" });

    const res = await POST(
      postReq({ approvalType: "SCOPE_OF_WORK", status: "REJECTED" }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(approvalUpdate.mock.calls[0][0].where).toEqual({ id: "ap_old" });
    expect(approvalCreate).not.toHaveBeenCalled();
  });
});
