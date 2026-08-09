import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const estimateFindUnique = vi.fn();
const estimateUpdateMany = vi.fn();
const reportApprovalFindFirst = vi.fn();
const checkBillingCompleteness = vi.fn();
const recordMutationAudit = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    estimate: {
      findUnique: (...args: unknown[]) => estimateFindUnique(...args),
      updateMany: (...args: unknown[]) => estimateUpdateMany(...args),
    },
    reportApproval: {
      findFirst: (...args: unknown[]) => reportApprovalFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/billing-completeness-check", () => ({
  checkBillingCompleteness: (...args: unknown[]) =>
    checkBillingCompleteness(...args),
}));
vi.mock("@/lib/audit-log", () => ({
  recordMutationAudit: (...args: unknown[]) => recordMutationAudit(...args),
}));

import { PATCH } from "../route";

const respondedAt = new Date("2026-08-09T10:00:00.000Z");
const reportUpdatedAt = new Date("2026-08-09T09:55:00.000Z");

function request(status: string) {
  return new NextRequest("http://localhost/api/estimates/estimate_1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

const params = { params: Promise.resolve({ id: "estimate_1" }) };

function estimate(status: string) {
  return {
    id: "estimate_1",
    userId: "user_1",
    reportId: "report_1",
    report: {
      reportVersion: 3,
      updatedAt: reportUpdatedAt,
    },
    status,
    subtotalExGST: 1000,
    totalIncGST: 1100,
    estimatedDuration: 3,
    metadata: null,
    scope: {
      scopeType: "WATER",
      siteVariables: JSON.stringify({ affectedAreaM2: 10 }),
      complianceNotes: null,
    },
    lineItems: [
      {
        category: "Mitigation/Drying",
        description: "Drying",
        qty: 1,
        subtotal: 1000,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  estimateUpdateMany.mockResolvedValue({ count: 1 });
  reportApprovalFindFirst.mockResolvedValue(null);
  checkBillingCompleteness.mockReturnValue({
    complete: true,
    blockers: [],
    warnings: [],
  });
  recordMutationAudit.mockResolvedValue(undefined);
});

describe("PATCH /api/estimates/[id]/status", () => {
  it("allows the legal DRAFT to INTERNAL_REVIEW transition", async () => {
    estimateFindUnique
      .mockResolvedValueOnce(estimate("DRAFT"))
      .mockResolvedValueOnce(estimate("INTERNAL_REVIEW"));

    const res = await PATCH(request("INTERNAL_REVIEW"), params);

    expect(res.status).toBe(200);
    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "estimate_1",
        userId: "user_1",
        status: "DRAFT",
      },
      data: { status: "INTERNAL_REVIEW", updatedBy: "user_1" },
    });
    expect(checkBillingCompleteness).toHaveBeenCalledTimes(1);
  });

  it("rejects a direct DRAFT to APPROVED transition", async () => {
    estimateFindUnique.mockResolvedValueOnce(estimate("DRAFT"));

    const res = await PATCH(request("APPROVED"), params);

    expect(res.status).toBe(409);
    expect(reportApprovalFindFirst).not.toHaveBeenCalled();
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });

  it("requires client approval provenance for CLIENT_REVIEW to APPROVED", async () => {
    estimateFindUnique.mockResolvedValueOnce(estimate("CLIENT_REVIEW"));

    const res = await PATCH(request("APPROVED"), params);

    expect(res.status).toBe(409);
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });

  it("approves only when client approval exists for the current amount", async () => {
    estimateFindUnique
      .mockResolvedValueOnce(estimate("CLIENT_REVIEW"))
      .mockResolvedValueOnce(estimate("APPROVED"));
    reportApprovalFindFirst.mockResolvedValueOnce({
      id: "approval_1",
      respondedAt,
      amount: 1100,
      respondedByClientUserId: "client_user_1",
    });

    const res = await PATCH(request("APPROVED"), params);

    expect(res.status).toBe(200);
    expect(reportApprovalFindFirst).toHaveBeenCalledWith({
      where: {
        reportId: "report_1",
        approvalType: "COST_ESTIMATE",
        status: "APPROVED",
        respondedAt: { not: null },
        responseSource: "CLIENT_PORTAL",
        respondedByClientUserId: { not: null },
        responseReportVersion: 3,
        responseReportUpdatedAt: reportUpdatedAt,
      },
      select: {
        id: true,
        respondedAt: true,
        amount: true,
        respondedByClientUserId: true,
      },
    });
    expect(estimateUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "estimate_1",
        userId: "user_1",
        status: "CLIENT_REVIEW",
      },
      data: {
        status: "APPROVED",
        updatedBy: "user_1",
        approvedAt: respondedAt,
        approverName: "Client portal approval",
        approverRole: "CLIENT",
      },
    });
    expect(recordMutationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          from: "CLIENT_REVIEW",
          to: "APPROVED",
          clientApprovalId: "approval_1",
        },
      }),
    );
  });

  it("rejects approval when the approved amount differs", async () => {
    estimateFindUnique.mockResolvedValueOnce(estimate("CLIENT_REVIEW"));
    reportApprovalFindFirst.mockResolvedValueOnce({
      id: "approval_1",
      respondedAt,
      amount: 900,
      respondedByClientUserId: "client_user_1",
    });

    const res = await PATCH(request("APPROVED"), params);

    expect(res.status).toBe(409);
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a legacy approval without durable portal provenance", async () => {
    estimateFindUnique.mockResolvedValueOnce(estimate("CLIENT_REVIEW"));
    reportApprovalFindFirst.mockResolvedValueOnce(null);

    const res = await PATCH(request("APPROVED"), params);

    expect(res.status).toBe(409);
    expect(reportApprovalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          responseSource: "CLIENT_PORTAL",
          respondedByClientUserId: { not: null },
          responseReportVersion: 3,
          responseReportUpdatedAt: reportUpdatedAt,
        }),
      }),
    );
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });

  it("allows APPROVED to LOCKED and rejects leaving LOCKED", async () => {
    estimateFindUnique
      .mockResolvedValueOnce(estimate("APPROVED"))
      .mockResolvedValueOnce(estimate("LOCKED"));

    const lockRes = await PATCH(request("LOCKED"), params);

    expect(lockRes.status).toBe(200);
    expect(reportApprovalFindFirst).not.toHaveBeenCalled();

    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "user_1" } });
    estimateFindUnique.mockResolvedValueOnce(estimate("LOCKED"));

    const unlockRes = await PATCH(request("DRAFT"), params);

    expect(unlockRes.status).toBe(409);
    expect(estimateUpdateMany).not.toHaveBeenCalled();
  });
});
