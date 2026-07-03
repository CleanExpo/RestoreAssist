/**
 * Interview Analytics API
 * GET /api/forms/interview/analytics
 * GET /api/forms/interview/analytics?userId=<id>
 * GET /api/forms/interview/analytics?templateId=<id>
 * GET /api/forms/interview/analytics?type=aggregate
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InterviewAnalyticsService } from "@/lib/forms/analytics";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/forms/interview/analytics
 * Retrieve interview analytics based on query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Get user from database to get userId
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const templateId = searchParams.get("templateId");
    const type = searchParams.get("type");

    // Get aggregate statistics (user-scoped for dashboard KPIs)
    if (type === "aggregate") {
      const stats =
        await InterviewAnalyticsService.getAggregateStatisticsForUser(user.id);
      return NextResponse.json(stats);
    }

    // Get user-specific analytics
    if (userId) {
      // Security: Users can only see their own analytics unless they're admin
      if (userId !== user.id && user.role !== "ADMIN") {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      const summary =
        await InterviewAnalyticsService.getUserAnalyticsSummary(userId);
      return NextResponse.json(summary);
    }

    // Get template performance analytics
    if (templateId) {
      // RA-6968: previously any authenticated user could pass an arbitrary
      // templateId and pull aggregate performance data (completion rate,
      // average session duration, most-difficult-questions) for another
      // user's private FormTemplate — no ownership check at all. Scope to
      // templates the caller owns, shared system templates, or admins.
      const template = await prisma.formTemplate.findUnique({
        where: { id: templateId },
        select: { userId: true, isSystemTemplate: true },
      });

      if (!template) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Form template not found",
          status: 404,
        });
      }

      const canView =
        template.isSystemTemplate ||
        template.userId === user.id ||
        user.role === "ADMIN";

      if (!canView) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      const analytics =
        await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
          templateId,
        );
      return NextResponse.json(analytics);
    }

    // Default: Get current user analytics
    const userAnalytics =
      await InterviewAnalyticsService.getUserAnalyticsSummary(user.id);
    return NextResponse.json(userAnalytics);
  } catch (error) {
    return fromException(request, error, { stage: "analytics" });
  }
}
