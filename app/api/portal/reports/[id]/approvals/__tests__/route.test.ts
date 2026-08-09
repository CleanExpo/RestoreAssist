import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authenticateClientRequest = vi.fn();
vi.mock("@/lib/portal/client-jwt", () => ({
  authenticateClientRequest: (...a: unknown[]) =>
    authenticateClientRequest(...a),
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
const approvalFindFirst = vi.fn();
const approvalUpdateMany = vi.fn();
const clientUserFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientUser: {
      findUnique: (...a: unknown[]) => clientUserFindUnique(...a),
    },
    report: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
    reportApproval: {
      findFirst: (...a: unknown[]) => approvalFindFirst(...a),
      updateMany: (...a: unknown[]) => approvalUpdateMany(...a),
    },
  },
}));

import { POST } from "../route";

const reportUpdatedAt = "2026-08-09T10:00:00.000Z";
const publishedReport = {
  id: "r_1",
  status: "COMPLETED",
  reportVersion: 3,
  updatedAt: new Date(reportUpdatedAt),
  totalCost: 1250,
  inspectionPdfUrl: null,
  detailedReport: "Final report",
  scopeOfWorksDocument: "Published scope",
  costEstimationDocument: "Published estimate",
};
const pendingApproval = {
  id: "ap_1",
  reportId: "r_1",
  approvalType: "SCOPE_OF_WORK",
  status: "PENDING",
  requestedAt: new Date("2026-08-09T10:01:00.000Z"),
  respondedAt: null,
  clientComments: null,
  amount: null,
  createdAt: new Date("2026-08-09T10:01:00.000Z"),
  updatedAt: new Date("2026-08-09T10:01:00.000Z"),
};

const clientClaims = {
  sub: "u_c",
  clientId: "c_1",
  email: "homeowner@example.com",
  name: "Home Owner",
  typ: "client-portal",
};

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/portal/reports/r_1/approvals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ctx = { params: Promise.resolve({ id: "r_1" }) };
const approve = {
  approvalId: "ap_1",
  approvalType: "SCOPE_OF_WORK",
  status: "APPROVED",
  reportVersion: 3,
  reportUpdatedAt,
};

beforeEach(() => {
  vi.clearAllMocks();
  authenticateClientRequest.mockResolvedValue(clientClaims);
  clientUserFindUnique.mockResolvedValue({ id: "u_c", clientId: "c_1" });
  reportFindFirst.mockResolvedValue(publishedReport);
  approvalFindFirst.mockResolvedValue(pendingApproval);
  approvalUpdateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/portal/reports/[id]/approvals", () => {
  it("returns 401 when the bearer token is missing or invalid", async () => {
    authenticateClientRequest.mockResolvedValueOnce(null);
    expect((await POST(postReq(approve), ctx)).status).toBe(401);
  });

  it("returns 404 when the report does not belong to the client", async () => {
    reportFindFirst.mockResolvedValueOnce(null);

    const response = await POST(postReq(approve), ctx);

    expect(response.status).toBe(404);
    expect(reportFindFirst.mock.calls[0][0].where).toMatchObject({
      id: "r_1",
      clientId: "c_1",
    });
    expect(approvalUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a draft report even when it has document content", async () => {
    reportFindFirst.mockResolvedValueOnce({
      ...publishedReport,
      status: "DRAFT",
    });

    const response = await POST(postReq(approve), ctx);

    expect(response.status).toBe(404);
    expect(approvalUpdateMany).not.toHaveBeenCalled();
  });

  it("requires the requested published document", async () => {
    reportFindFirst.mockResolvedValueOnce({
      ...publishedReport,
      scopeOfWorksDocument: null,
    });

    const response = await POST(postReq(approve), ctx);

    expect(response.status).toBe(409);
    expect(approvalFindFirst).not.toHaveBeenCalled();
    expect(approvalUpdateMany).not.toHaveBeenCalled();
  });

  it("requires the exact pending approval request", async () => {
    approvalFindFirst.mockResolvedValueOnce(null);

    const response = await POST(postReq(approve), ctx);

    expect(response.status).toBe(409);
    expect(approvalFindFirst.mock.calls[0][0].where).toMatchObject({
      id: "ap_1",
      reportId: "r_1",
      approvalType: "SCOPE_OF_WORK",
      status: "PENDING",
    });
    expect(approvalUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale request after the report changes", async () => {
    approvalFindFirst.mockResolvedValueOnce({
      ...pendingApproval,
      requestedAt: new Date("2026-08-09T09:59:59.000Z"),
    });

    const response = await POST(postReq(approve), ctx);

    expect(response.status).toBe(409);
    expect(approvalUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a decision submitted from an older rendered revision", async () => {
    const response = await POST(postReq({ ...approve, reportVersion: 2 }), ctx);

    expect(response.status).toBe(409);
    expect(approvalFindFirst).not.toHaveBeenCalled();
    expect(approvalUpdateMany).not.toHaveBeenCalled();
  });

  it("atomically responds to the current pending request", async () => {
    const response = await POST(postReq(approve), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approval).toMatchObject({ id: "ap_1", status: "APPROVED" });
    expect(approvalUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "ap_1",
        reportId: "r_1",
        approvalType: "SCOPE_OF_WORK",
        status: "PENDING",
        requestedAt: pendingApproval.requestedAt,
      },
      data: {
        status: "APPROVED",
        respondedAt: expect.any(Date),
        clientComments: null,
      },
    });
  });

  it("rejects a raced second response", async () => {
    approvalUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(postReq(approve), ctx);

    expect(response.status).toBe(409);
  });
});
