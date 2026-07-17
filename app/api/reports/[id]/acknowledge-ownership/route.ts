import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { canAcknowledgeAiOwnership } from "@/lib/reports/ai-ownership";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Application holder confirms the AI draft has been rewritten in their words.
 * Requires a prior human save of detailedReport after AI generation.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id } = await context.params;

  try {
    const report = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        detailedReport: true,
        aiDraftGeneratedAt: true,
        aiDraftHumanEditedAt: true,
        reportOwnershipAcknowledgedAt: true,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    if (report.reportOwnershipAcknowledgedAt) {
      return NextResponse.json({
        acknowledged: true,
        reportOwnershipAcknowledgedAt: report.reportOwnershipAcknowledgedAt,
      });
    }

    if (!canAcknowledgeAiOwnership(report)) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Rewrite and save the report in your own words before acknowledging ownership",
        status: 400,
      });
    }

    const updated = await prisma.report.update({
      where: { id },
      data: {
        reportOwnershipAcknowledgedAt: new Date(),
        reportOwnershipAcknowledgedBy: session.user.id,
      },
      select: {
        id: true,
        reportOwnershipAcknowledgedAt: true,
        reportOwnershipAcknowledgedBy: true,
      },
    });

    return NextResponse.json({
      acknowledged: true,
      report: updated,
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "acknowledge-report-ownership",
    });
  }
}
