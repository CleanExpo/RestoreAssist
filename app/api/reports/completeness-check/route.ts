import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { COMPLETENESS_INSPECTION_INCLUDE } from "@/lib/reports/completeness-inspection-include";
import {
  computeReportCompletenessSections,
  overallScoreFromSections,
} from "@/lib/reports/completeness";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const { reportId } = await request.json();

    if (!reportId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "reportId is required",
        status: 400,
      });
    }

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId: session.user.id },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        inspection: {
          include: COMPLETENESS_INSPECTION_INCLUDE,
        },
        // RA-7003: signed client authorisations.
        authorityForms: {
          where: { status: "COMPLETED" },
          select: { id: true },
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

    const sections = computeReportCompletenessSections(report);
    const overallScore = overallScoreFromSections(sections);

    return NextResponse.json({
      reportId,
      reportTitle: report.reportNumber ?? reportId,
      overallScore,
      sections,
    });
  } catch (error) {
    return fromException(request, error, { stage: "completeness-check" });
  }
}
