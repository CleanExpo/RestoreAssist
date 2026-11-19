import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionFinancialReach } from "@/lib/auth/assert-tenancy";
import { computeJobMargin } from "@/lib/analytics/job-margin";

/** GET — labour + equipment + invoice margin snapshot (W4-2). */
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
    const reach = await resolveInspectionFinancialReach(session);
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }

    const inspection = await prisma.inspection.findFirst({
      where: { AND: [{ id }, reach.data] },
      select: {
        id: true,
        inspectionNumber: true,
        reportId: true,
        costEstimates: {
          select: { category: true, subtotal: true },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    let invoicedSubtotalExGst: number | null = null;
    if (inspection.reportId) {
      const invoice = await prisma.invoice.findFirst({
        where: { reportId: inspection.reportId },
        orderBy: { invoiceDate: "desc" },
        select: { subtotalExGST: true, status: true },
      });
      if (
        invoice &&
        invoice.status !== "DRAFT" &&
        invoice.status !== "CANCELLED"
      ) {
        invoicedSubtotalExGst = invoice.subtotalExGST / 100;
      }
    }

    const snapshot = computeJobMargin({
      costEstimates: inspection.costEstimates,
      invoicedSubtotalExGst,
    });

    return NextResponse.json({
      data: {
        inspectionId: inspection.id,
        inspectionNumber: inspection.inspectionNumber,
        ...snapshot,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "job-margin" });
  }
}