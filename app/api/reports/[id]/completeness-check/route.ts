import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateCompletenessScore,
  checkCompletenessBeforeGeneration,
} from "@/lib/validation";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Check report completeness
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { id } = await params;

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Calculate completeness score
    const completenessScore = calculateCompletenessScore(report);

    // Check completeness before generation
    const completenessCheck = checkCompletenessBeforeGeneration(report);

    // Update report with completeness score
    await prisma.report.update({
      where: { id, userId: user.id },
      data: {
        completenessScore,
      },
    });

    // Calculate section breakdown
    const sections = {
      required: {
        label: "Required Sections",
        completed: completenessCheck.missingItems.length === 0,
        percentage:
          completenessCheck.missingItems.length === 0
            ? 100
            : Math.max(0, 100 - completenessCheck.missingItems.length * 10),
      },
      enhancement: {
        label: "Enhancement Sections",
        completed: report.tier2Responses ? true : false,
        percentage: report.tier2Responses ? 100 : 0,
        details: report.tier2Responses
          ? "All Tier 2 questions completed ✓"
          : "Tier 2 questions not started",
      },
      optimisation: {
        label: "Optimisation Sections",
        completed: report.tier3Responses ? true : false,
        percentage: report.tier3Responses ? 100 : 0,
        details: report.tier3Responses
          ? "All Tier 3 questions completed ✓"
          : "Tier 3 questions not started",
      },
    };

    return NextResponse.json({
      completenessScore,
      canGenerate: completenessCheck.canGenerate,
      missingItems: completenessCheck.missingItems,
      warnings: completenessCheck.warnings,
      sections,
      overallPercentage: completenessScore,
    });
  } catch (error) {
    return fromException(request, error, { stage: "completeness-check" });
  }
}
