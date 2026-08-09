import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireClientAuth = vi.fn();
const reportFindMany = vi.fn();

vi.mock("@/lib/portal/require-client-auth", () => ({
  requireClientAuth: (...args: unknown[]) => requireClientAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findMany: (...args: unknown[]) => reportFindMany(...args) },
  },
}));

import { GET } from "../route";

const request = () =>
  new NextRequest("http://localhost/api/portal/reports", { method: "GET" });

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "report_1",
    title: "Published report",
    description: null,
    status: "COMPLETED",
    propertyAddress: "1 Test Street",
    hazardType: "Water",
    totalCost: 1200,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-09T10:00:00.000Z"),
    waterCategory: "1",
    waterClass: "2",
    completionDate: null,
    inspectionPdfUrl: null,
    detailedReport: "Final report",
    scopeOfWorksDocument: null,
    costEstimationDocument: null,
    approvals: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireClientAuth.mockResolvedValue({
    ok: true,
    claims: { clientId: "client_1" },
  });
});

describe("GET /api/portal/reports", () => {
  it("lists only published reports and ignores stale approval decisions", async () => {
    reportFindMany.mockResolvedValue([
      report({
        approvals: [
          {
            id: "stale",
            reportId: "report_1",
            approvalType: "SCOPE_OF_WORK",
            status: "APPROVED",
            requestedAt: new Date("2026-08-08T09:00:00.000Z"),
            respondedAt: new Date("2026-08-08T10:00:00.000Z"),
            clientComments: null,
            amount: null,
            createdAt: new Date("2026-08-08T09:00:00.000Z"),
            updatedAt: new Date("2026-08-08T10:00:00.000Z"),
          },
          {
            id: "pending",
            reportId: "report_1",
            approvalType: "COST_ESTIMATE",
            status: "PENDING",
            requestedAt: new Date("2026-08-09T10:01:00.000Z"),
            respondedAt: null,
            clientComments: null,
            amount: 1200,
            createdAt: new Date("2026-08-09T10:01:00.000Z"),
            updatedAt: new Date("2026-08-09T10:01:00.000Z"),
          },
        ],
      }),
      report({ id: "draft", status: "DRAFT" }),
      report({ id: "empty", detailedReport: "   " }),
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0]).toMatchObject({
      id: "report_1",
      pendingApprovals: 1,
      approvedCount: 0,
      rejectedCount: 0,
    });
    expect(
      body.reports[0].approvals.map((item: { id: string }) => item.id),
    ).toEqual(["pending"]);
    expect(reportFindMany.mock.calls[0][0].where).toMatchObject({
      clientId: "client_1",
      status: "COMPLETED",
    });
  });
});
