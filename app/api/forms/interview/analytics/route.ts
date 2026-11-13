/**
 * Interview Analytics API
 * GET /api/forms/interview/analytics
 * GET /api/forms/interview/analytics?userId=<id>
 * GET /api/forms/interview/analytics?templateId=<id>
 * GET /api/forms/interview/analytics?type=aggregate
 * GET /api/forms/interview/analytics?type=template  — list of templates used
 * GET /api/forms/interview/analytics?type=user      — list of team users with sessions
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InterviewAnalyticsService } from "@/lib/forms/analytics";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";

type Caller = { id: string; role: string; organizationId: string | null };

/**
 * The users whose interview sessions the caller may see (RA-8043b). ADMIN or
 * MANAGER with an organisation see their teammates (a MANAGER only the USERs);
 * everyone else, and anyone without an organisation, sees only themselves.
 * `role: "ADMIN"` is every firm owner, so it never widens past their own firm.
 */
async function teamMemberIds(user: Caller): Promise<string[]> {
  const memberIds: string[] = [user.id];
  if (
    user.organizationId &&
    (user.role === "ADMIN" || user.role === "MANAGER")
  ) {
    const where =
      user.role === "MANAGER"
        ? { organizationId: user.organizationId, role: "USER" as const }
        : { organizationId: user.organizationId };
    const members = await prisma.user.findMany({
      where,
      select: { id: true },
      take: 500,
    });
    for (const m of members) {
      if (!memberIds.includes(m.id)) memberIds.push(m.id);
    }
  }
  return memberIds;
}

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
      select: { id: true, role: true, organizationId: true },
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

    // List template performance rows for the interview-analytics Templates tab
    if (type === "template") {
      const templates =
        await InterviewAnalyticsService.getTemplatePerformanceListForUser(
          user.id,
        );
      return NextResponse.json({ templates });
    }

    // List per-user performance for the interview-analytics Users tab.
    // ADMIN/MANAGER with an org see org teammates; everyone else sees self.
    if (type === "user") {
      const memberIds = await teamMemberIds(user);
      const users =
        await InterviewAnalyticsService.getUserPerformanceList(memberIds);
      return NextResponse.json({ users });
    }

    const platform =
      user.role === "ADMIN" && isPlatformSupportOperator(user.id);

    // Get user-specific analytics
    if (userId) {
      // Security: users see their own analytics; a firm ADMIN also sees their
      // own firm's people, never another firm's (RA-8043b).
      const allowed =
        userId === user.id ||
        platform ||
        (user.role === "ADMIN" && (await teamMemberIds(user)).includes(userId));
      if (!allowed) {
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
      // templates the caller owns, shared system templates, or the caller's
      // own firm (RA-8043b: a firm ADMIN no longer sees other firms' templates).
      // The sessions counted are always the caller's team's, so a shared
      // system template does not reveal other firms' usage.
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

      const memberIds = platform ? null : await teamMemberIds(user);
      const canView =
        platform ||
        template.isSystemTemplate ||
        template.userId === user.id ||
        (user.role === "ADMIN" &&
          template.userId !== null &&
          (memberIds ?? []).includes(template.userId));

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
          memberIds ?? undefined,
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
