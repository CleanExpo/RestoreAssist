import { NextRequest, NextResponse } from "next/server";
import type { ApprovalStatus, ApprovalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { requireClientAuth } from "@/lib/portal/require-client-auth";
import {
  hasPublishedApprovalDocument,
  isApprovalForCurrentRevision,
  isPortalReportPublished,
} from "@/lib/portal/report-publication";

// POST /api/portal/reports/[id]/approvals - Create or update approval (bearer JWT)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientAuth(request);
  if (!auth.ok) return auth.response;

  const clientId = auth.claims.clientId;
  const { id: reportId } = await params;

  // RA-1266: find-or-create pattern is race-prone — parallel retries
  // without idempotency can both fail the find and create duplicate rows.
  return withIdempotency(request, clientId, async (rawBody) => {
    try {
      let body: Record<string, unknown>;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const {
        approvalId,
        approvalType,
        status,
        clientComments,
        reportVersion,
        reportUpdatedAt,
      } = body;

      // Validate approvalType and status
      if (
        typeof approvalType !== "string" ||
        !["SCOPE_OF_WORK", "COST_ESTIMATE"].includes(approvalType)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid approval type",
          status: 400,
        });
      }

      const validatedApprovalType = approvalType as ApprovalType;

      if (typeof approvalId !== "string" || !approvalId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Approval request ID is required",
          status: 400,
        });
      }

      if (
        typeof reportVersion !== "number" ||
        !Number.isInteger(reportVersion) ||
        typeof reportUpdatedAt !== "string" ||
        !Number.isFinite(new Date(reportUpdatedAt).getTime())
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Report revision is required",
          status: 400,
        });
      }

      if (
        clientComments !== undefined &&
        clientComments !== null &&
        (typeof clientComments !== "string" || clientComments.length > 5000)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Comments must be 5000 characters or fewer",
          status: 400,
        });
      }

      if (
        typeof status !== "string" ||
        !["APPROVED", "REJECTED", "CHANGES_REQUESTED"].includes(status)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid status",
          status: 400,
        });
      }

      const validatedStatus = status as ApprovalStatus;

      // Verify report belongs to this client
      const report = await prisma.report.findFirst({
        where: {
          id: reportId,
          clientId,
        },
        select: {
          id: true,
          status: true,
          reportVersion: true,
          updatedAt: true,
          totalCost: true,
          inspectionPdfUrl: true,
          detailedReport: true,
          scopeOfWorksDocument: true,
          costEstimationDocument: true,
        },
      });

      if (!report || !isPortalReportPublished(report)) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      if (!hasPublishedApprovalDocument(report, validatedApprovalType)) {
        return apiError(request, {
          code: "CONFLICT",
          message: "The requested approval document is not available",
          status: 409,
        });
      }

      if (
        report.reportVersion !== reportVersion ||
        report.updatedAt.getTime() !== new Date(reportUpdatedAt).getTime()
      ) {
        return apiError(request, {
          code: "CONFLICT",
          message: "The report changed after it was opened. Review it again.",
          status: 409,
        });
      }

      // A client can only respond to the exact pending request rendered in the
      // portal. Never manufacture an approval from a bare report/type pair.
      const existingApproval = await prisma.reportApproval.findFirst({
        where: {
          id: approvalId,
          reportId,
          approvalType: validatedApprovalType,
          status: "PENDING",
        },
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
      });

      if (!existingApproval) {
        return apiError(request, {
          code: "CONFLICT",
          message: "No pending approval request is available",
          status: 409,
        });
      }

      if (!isApprovalForCurrentRevision(report, existingApproval)) {
        return apiError(request, {
          code: "CONFLICT",
          message: "This approval request is stale. Ask for a new request.",
          status: 409,
        });
      }

      if (
        validatedApprovalType === "COST_ESTIMATE" &&
        (existingApproval.amount === null ||
          report.totalCost === null ||
          Math.abs(existingApproval.amount - report.totalCost) > 0.01)
      ) {
        return apiError(request, {
          code: "CONFLICT",
          message: "The cost estimate changed. Ask for a new approval request.",
          status: 409,
        });
      }

      const respondedAt = new Date();
      const updateResult = await prisma.reportApproval.updateMany({
        where: {
          id: existingApproval.id,
          reportId,
          approvalType: validatedApprovalType,
          status: "PENDING",
          requestedAt: existingApproval.requestedAt,
          report: {
            is: {
              clientId,
              reportVersion: report.reportVersion,
              updatedAt: report.updatedAt,
            },
          },
        },
        data: {
          status: validatedStatus,
          respondedAt,
          responseSource: "CLIENT_PORTAL",
          respondedByClientUserId: auth.claims.sub,
          responseReportVersion: report.reportVersion,
          responseReportUpdatedAt: report.updatedAt,
          clientComments:
            typeof clientComments === "string" && clientComments
              ? clientComments
              : null,
        },
      });

      if (updateResult.count !== 1) {
        return apiError(request, {
          code: "CONFLICT",
          message: "This approval request has already been answered",
          status: 409,
        });
      }

      return NextResponse.json({
        approval: {
          ...existingApproval,
          status: validatedStatus,
          respondedAt,
          responseSource: "CLIENT_PORTAL",
          respondedByClientUserId: auth.claims.sub,
          responseReportVersion: report.reportVersion,
          responseReportUpdatedAt: report.updatedAt,
          clientComments:
            typeof clientComments === "string" && clientComments
              ? clientComments
              : null,
        },
      });
    } catch (error) {
      console.error("Error creating/updating approval:", error);
      return fromException(request, error, {
        stage: "portal/reports/approvals:upsert",
      });
    }
  });
}

// GET /api/portal/reports/[id]/approvals - Get approvals for a report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;

    const clientId = auth.claims.clientId;
    const { id: reportId } = await params;

    // Verify report belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        inspectionPdfUrl: true,
        detailedReport: true,
        scopeOfWorksDocument: true,
        costEstimationDocument: true,
      },
    });

    if (!report || !isPortalReportPublished(report)) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const approvals = await prisma.reportApproval.findMany({
      where: { reportId },
      select: {
        id: true,
        reportId: true,
        approvalType: true,
        status: true,
        requestedAt: true,
        amount: true,
        clientComments: true,
        respondedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      approvals: approvals.filter((approval) =>
        isApprovalForCurrentRevision(report, approval),
      ),
    });
  } catch (error) {
    console.error("Error fetching approvals:", error);
    return fromException(request, error, {
      stage: "portal/reports/approvals:list",
    });
  }
}
