import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  suggestAuthorityForms,
  extractReportAnalysis,
} from "@/lib/authority-forms-suggestions";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/reports/:id/authority-forms/suggestions
 * Get suggested authority forms for a report based on report data
 */
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

    const { id: reportId } = await params;

    // Fetch report with all necessary data
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        waterCategory: true,
        waterClass: true,
        scopeOfWorksData: true,
        equipmentSelection: true,
        equipmentUsed: true,
        psychrometricAssessment: true,
        biologicalMouldDetected: true,
        methamphetamineScreen: true,
        userId: true,
        assignedManagerId: true,
        assignedAdminId: true,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Check permissions - user must own the report or be assigned to it
    if (
      report.userId !== session.user.id &&
      report.assignedManagerId !== session.user.id &&
      report.assignedAdminId !== session.user.id
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // Extract analysis from report
    const analysis = extractReportAnalysis(report);

    // Get suggestions
    const suggestions = suggestAuthorityForms(analysis);

    // Check which forms already exist for this report.
    // Only the template.code is read downstream, so select minimally.
    const existingForms = await prisma.authorityFormInstance.findMany({
      where: { reportId },
      select: {
        template: {
          select: { code: true },
        },
      },
      take: 100,
    });

    const existingCodes = new Set(existingForms.map((f) => f.template.code));

    // Mark which suggestions are already created
    const suggestionsWithStatus = suggestions.map((suggestion) => ({
      ...suggestion,
      alreadyCreated: existingCodes.has(suggestion.templateCode),
    }));

    return NextResponse.json({
      suggestions: suggestionsWithStatus,
      analysis, // Include analysis for debugging/transparency
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "authority-forms-suggestions",
    });
  }
}
