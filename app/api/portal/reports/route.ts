import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";
import { requireClientAuth } from "@/lib/portal/require-client-auth";
import {
  isApprovalForCurrentRevision,
  isPortalReportPublished,
} from "@/lib/portal/report-publication";

// GET /api/portal/reports - Get reports for logged-in client (bearer JWT)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;

    const clientId = auth.claims.clientId;

    // Fetch all reports linked to this client
    const reports = await prisma.report.findMany({
      where: {
        clientId,
        status: "COMPLETED",
        OR: [
          { inspectionPdfUrl: { not: null } },
          { detailedReport: { not: null } },
          { scopeOfWorksDocument: { not: null } },
          { costEstimationDocument: { not: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        propertyAddress: true,
        hazardType: true,
        totalCost: true,
        createdAt: true,
        updatedAt: true,
        waterCategory: true,
        waterClass: true,
        completionDate: true,
        inspectionPdfUrl: true,
        detailedReport: true,
        scopeOfWorksDocument: true,
        costEstimationDocument: true,
        approvals: {
          select: {
            id: true,
            reportId: true,
            approvalType: true,
            status: true,
            requestedAt: true,
            respondedAt: true,
            clientComments: true,
            amount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 2,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    // Get approval statistics
    const reportsWithApprovalStatus = reports
      .filter(isPortalReportPublished)
      .map((report) => {
        const currentApprovals = report.approvals.filter((approval) =>
          isApprovalForCurrentRevision(report, approval),
        );
        const pendingApprovals = currentApprovals.filter(
          (a) => a.status === "PENDING",
        ).length;
        const approvedCount = currentApprovals.filter(
          (a) => a.status === "APPROVED",
        ).length;
        const rejectedCount = currentApprovals.filter(
          (a) => a.status === "REJECTED",
        ).length;

        const {
          inspectionPdfUrl: _inspectionPdfUrl,
          detailedReport: _detailedReport,
          scopeOfWorksDocument: _scopeOfWorksDocument,
          costEstimationDocument: _costEstimationDocument,
          ...portalReport
        } = report;

        return {
          ...portalReport,
          approvals: currentApprovals,
          pendingApprovals,
          approvedCount,
          rejectedCount,
        };
      });

    return NextResponse.json({ reports: reportsWithApprovalStatus });
  } catch (error) {
    console.error("Error fetching client reports:", error);
    return fromException(request, error, { stage: "portal/reports:list" });
  }
}
