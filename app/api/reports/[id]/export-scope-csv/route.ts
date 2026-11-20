import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveReportFinancialReach } from "@/lib/auth/assert-tenancy";
import { buildAdjusterScopeCsvFromInspection } from "@/lib/export/scope-adjuster-csv";

/** GET — adjuster-friendly scope CSV for a report's linked inspection (W4-1). */
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
    const reach = await resolveReportFinancialReach(session);
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }

    const report = await prisma.report.findFirst({
      where: { AND: [{ id }, reach.data] },
      select: {
        reportNumber: true,
        claimReferenceNumber: true,
        propertyAddress: true,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const inspection = await prisma.inspection.findFirst({
      where: { reportId: id },
      select: {
        inspectionNumber: true,
        propertyAddress: true,
        scopeItems: {
          select: {
            id: true,
            itemType: true,
            description: true,
            quantity: true,
            unit: true,
            clauseRef: true,
            isRequired: true,
            isSelected: true,
            justification: true,
          },
          orderBy: { createdAt: "asc" },
        },
        costEstimates: {
          select: {
            scopeItemId: true,
            category: true,
            description: true,
            quantity: true,
            unit: true,
            rate: true,
            subtotal: true,
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "CONFLICT",
        message:
          "This report has no linked inspection — capture scope on the job first.",
        status: 409,
      });
    }

    if (inspection.scopeItems.length === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "No scope items to export — complete scope on the job first.",
        status: 409,
      });
    }

    const csv = buildAdjusterScopeCsvFromInspection({
      jobNumber: inspection.inspectionNumber,
      claimReference:
        report.claimReferenceNumber ?? report.reportNumber ?? id,
      propertyAddress:
        inspection.propertyAddress ?? report.propertyAddress ?? "",
      scopeItems: inspection.scopeItems,
      costEstimates: inspection.costEstimates,
    });

    const claimRef =
      report.claimReferenceNumber || report.reportNumber || "report";
    const filename = `Scope-Adjuster-${claimRef}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "export-scope-csv" });
  }
}