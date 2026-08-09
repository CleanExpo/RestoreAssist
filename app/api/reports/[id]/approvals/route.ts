import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApprovalType } from "@prisma/client";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import {
  hasPublishedApprovalDocument,
  isApprovalForCurrentRevision,
  isPortalReportPublished,
} from "@/lib/portal/report-publication";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId: session.user.id,
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

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const approvals = await prisma.reportApproval.findMany({
      where: { reportId: id },
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
    return fromException(request, error, { stage: "approvals-get" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: approval row creation — retry without idempotency creates
  // duplicate PENDING approvals on the same report.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { approvalType } = body;

      // Validate approvalType
      if (
        !approvalType ||
        !Object.values(ApprovalType).includes(approvalType)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Invalid approvalType. Must be one of: ${Object.values(ApprovalType).join(", ")}`,
          status: 400,
        });
      }

      const report = await prisma.report.findFirst({
        where: {
          id,
          userId,
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          totalCost: true,
          inspectionPdfUrl: true,
          detailedReport: true,
          scopeOfWorksDocument: true,
          costEstimationDocument: true,
        },
      });

      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      if (!isPortalReportPublished(report)) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Complete and publish the report before requesting approval",
          status: 409,
        });
      }

      if (!hasPublishedApprovalDocument(report, approvalType)) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Publish the approval document before requesting approval",
          status: 409,
        });
      }

      if (approvalType === "COST_ESTIMATE" && report.totalCost === null) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Set the report total before requesting cost approval",
          status: 409,
        });
      }

      const approval = await prisma.reportApproval.upsert({
        where: {
          reportId_approvalType: { reportId: id, approvalType },
        },
        create: {
          reportId: id,
          approvalType,
          status: "PENDING",
          requestedAt: new Date(),
          amount: approvalType === "COST_ESTIMATE" ? report.totalCost : null,
        },
        update: {
          status: "PENDING",
          requestedAt: new Date(),
          respondedAt: null,
          responseSource: null,
          respondedByClientUserId: null,
          responseReportVersion: null,
          responseReportUpdatedAt: null,
          clientComments: null,
          amount: approvalType === "COST_ESTIMATE" ? report.totalCost : null,
        },
      });

      return NextResponse.json({ approval }, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "approvals-post" });
    }
  });
}
