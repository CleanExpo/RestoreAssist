import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientAuth } from "@/lib/portal/require-client-auth";
import { apiError, fromException } from "@/lib/api-errors";
import { generateConsumerReportPdf } from "@/lib/portal/consumer-report";

// Client downloads are plain-language decision summaries. Technical evidence
// remains available through the authenticated reviewer report.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;
    const { id } = await params;

    const report = await prisma.report.findFirst({
      where: { id, clientId: auth.claims.clientId },
      select: {
        id: true,
        title: true,
        status: true,
        propertyAddress: true,
        createdAt: true,
        reportNumber: true,
        user: { select: { businessName: true, name: true } },
        inspection: {
          select: {
            inspectionNumber: true,
            affectedAreas: { select: { id: true } },
            scopeItems: {
              where: { isSelected: true },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }
    if (report.status === "DRAFT") {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Report is not available for download",
        status: 403,
      });
    }

    const pdfBytes = await generateConsumerReportPdf({
      title: report.title,
      inspectionNumber:
        report.inspection?.inspectionNumber ?? report.reportNumber,
      propertyAddress: report.propertyAddress,
      status: report.status,
      date: report.createdAt,
      affectedAreaCount: report.inspection?.affectedAreas.length ?? 0,
      scopeItemCount: report.inspection?.scopeItems.length ?? 0,
      contractorName: report.user.businessName ?? report.user.name,
    });

    const filename = `client-report-${report.reportNumber || report.id}.pdf`.replace(
      /[^a-zA-Z0-9.\-_]/g,
      "-",
    );
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "portal/reports/download:get",
    });
  }
}
