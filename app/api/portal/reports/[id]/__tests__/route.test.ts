import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireClientAuth = vi.fn();
const reportFindFirst = vi.fn();

vi.mock("@/lib/portal/require-client-auth", () => ({
  requireClientAuth: (...args: unknown[]) => requireClientAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: (...args: unknown[]) => reportFindFirst(...args) },
  },
}));

import { GET } from "../route";

const request = () =>
  new NextRequest("http://localhost/api/portal/reports/report_1", {
    method: "GET",
  });
const context = { params: Promise.resolve({ id: "report_1" }) };

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "report_1",
    status: "COMPLETED",
    updatedAt: new Date("2026-08-09T10:00:00.000Z"),
    reportVersion: 2,
    inspectionPdfUrl: null,
    detailedReport: "Final report",
    scopeOfWorksDocument: "Final scope",
    costEstimationDocument: null,
    approvals: [],
    client: { name: "Client", email: "client@example.com", phone: null },
    user: {
      name: "Contractor",
      businessName: "Contractor Pty Ltd",
      businessPhone: null,
      businessEmail: null,
    },
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

describe("GET /api/portal/reports/[id]", () => {
  it.each([
    ["draft", { status: "DRAFT" }],
    [
      "documentless",
      {
        inspectionPdfUrl: null,
        detailedReport: null,
        scopeOfWorksDocument: null,
        costEstimationDocument: null,
      },
    ],
  ])("does not expose a %s report", async (_label, overrides) => {
    reportFindFirst.mockResolvedValueOnce(report(overrides));

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
  });

  it("returns a published report while removing stale approvals", async () => {
    reportFindFirst.mockResolvedValueOnce(
      report({
        approvals: [
          {
            id: "stale",
            status: "APPROVED",
            requestedAt: new Date("2026-08-08T00:00:00.000Z"),
            respondedAt: new Date("2026-08-08T01:00:00.000Z"),
          },
          {
            id: "current",
            status: "PENDING",
            requestedAt: new Date("2026-08-09T10:01:00.000Z"),
            respondedAt: null,
          },
        ],
      }),
    );

    const response = await GET(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.report.approvals.map((item: { id: string }) => item.id),
    ).toEqual(["current"]);
    expect(reportFindFirst.mock.calls[0][0].where).toMatchObject({
      id: "report_1",
      clientId: "client_1",
      status: "COMPLETED",
    });
  });
});
