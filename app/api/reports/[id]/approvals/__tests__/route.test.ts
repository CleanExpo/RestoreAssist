import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const reportFindFirst = vi.fn();
const approvalUpsert = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _key: string,
    callback: (rawBody: string) => Promise<unknown>,
  ) => callback(await request.text()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: (...args: unknown[]) => reportFindFirst(...args) },
    reportApproval: {
      upsert: (...args: unknown[]) => approvalUpsert(...args),
      findMany: vi.fn(),
    },
  },
}));

import { POST } from "../route";

const context = { params: Promise.resolve({ id: "report_1" }) };
const request = (approvalType: "SCOPE_OF_WORK" | "COST_ESTIMATE") =>
  new NextRequest("http://localhost/api/reports/report_1/approvals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approvalType }),
  });

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "report_1",
    status: "COMPLETED",
    updatedAt: new Date("2026-08-09T10:00:00.000Z"),
    totalCost: 1500,
    inspectionPdfUrl: null,
    detailedReport: "Final report",
    scopeOfWorksDocument: "Final scope",
    costEstimationDocument: "Final estimate",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  reportFindFirst.mockResolvedValue(report());
  approvalUpsert.mockResolvedValue({ id: "approval_1", status: "PENDING" });
});

describe("POST /api/reports/[id]/approvals", () => {
  it("rejects approval requests for draft reports", async () => {
    reportFindFirst.mockResolvedValueOnce(report({ status: "DRAFT" }));

    const response = await POST(request("SCOPE_OF_WORK"), context);

    expect(response.status).toBe(409);
    expect(approvalUpsert).not.toHaveBeenCalled();
  });

  it("rejects approval requests without the matching final document", async () => {
    reportFindFirst.mockResolvedValueOnce(
      report({ costEstimationDocument: null }),
    );

    const response = await POST(request("COST_ESTIMATE"), context);

    expect(response.status).toBe(409);
    expect(approvalUpsert).not.toHaveBeenCalled();
  });

  it("reissues one pending request bound to the current server-side amount", async () => {
    const response = await POST(request("COST_ESTIMATE"), context);

    expect(response.status).toBe(201);
    expect(approvalUpsert).toHaveBeenCalledWith({
      where: {
        reportId_approvalType: {
          reportId: "report_1",
          approvalType: "COST_ESTIMATE",
        },
      },
      create: expect.objectContaining({
        reportId: "report_1",
        approvalType: "COST_ESTIMATE",
        status: "PENDING",
        amount: 1500,
        requestedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        status: "PENDING",
        respondedAt: null,
        responseSource: null,
        respondedByClientUserId: null,
        responseReportVersion: null,
        responseReportUpdatedAt: null,
        clientComments: null,
        amount: 1500,
        requestedAt: expect.any(Date),
      }),
    });
  });
});
