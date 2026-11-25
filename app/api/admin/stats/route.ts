import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";
import {
  isReadyOAuthCandidate,
  OAUTH_CANDIDATE_WHERE,
  OAUTH_IDENTITY_SELECT,
  OAUTH_READY_PREFILTER_WHERE,
} from "@/lib/services/integrations/select-oauth";

const READY_COUNT_PAGE = 500;

/**
 * RA-8446: "connected" means the readiness owner calls the connection ready
 * (getOAuthReadiness), so a CONNECTED row with no organisation is not counted
 * and a SYNCING / ERROR row the owner accepts is. Paged by id so the count is
 * exact without loading every row at once.
 */
async function countReadyOAuthIntegrations(): Promise<number> {
  let ready = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.integration.findMany({
      where: { ...OAUTH_CANDIDATE_WHERE, ...OAUTH_READY_PREFILTER_WHERE },
      select: OAUTH_IDENTITY_SELECT,
      orderBy: { id: "asc" },
      take: READY_COUNT_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    ready += rows.filter(row => isReadyOAuthCandidate(row)).length;
    if (rows.length < READY_COUNT_PAGE) return ready;
    cursor = rows[rows.length - 1].id;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Re-validates role from DB, then requires platform-support staff.
    // Tenant ADMIN is every self-registered owner (RA-7592).
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    const operator = verifyPlatformSupportOperator(auth);
    if (operator.response) return operator.response;

    // Get current date for this month's reports
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get 30 days ago for active users
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch stats in parallel
    const [
      totalUsers,
      activeUsers,
      totalOrganizations,
      activeSubscriptions,
      totalReports,
      reportsThisMonth,
      dbHealth,
      connectedIntegrations,
      erroredIntegrations,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),

      // Active users (updated in last 30 days)
      prisma.user.count({
        where: {
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),

      // Total organizations
      prisma.organization.count(),

      // Active subscriptions
      prisma.user.count({
        where: {
          subscriptionStatus: "ACTIVE",
        },
      }),

      // Total reports
      prisma.report.count(),

      // Reports this month
      prisma.report.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      }),

      // Database health check
      prisma
        .$queryRaw(Prisma.sql`SELECT 1 as health`)
        .then(() => "healthy" as const)
        .catch(() => "down" as const),

      countReadyOAuthIntegrations(),
      prisma.integration.count({ where: { status: "ERROR" } }),
    ]);

    const integrationsHealth =
      erroredIntegrations > 0
        ? ("degraded" as const)
        : connectedIntegrations > 0
          ? ("healthy" as const)
          : ("healthy" as const);

    return NextResponse.json({
      totalUsers,
      activeUsers,
      totalOrganizations,
      activeSubscriptions,
      totalReports,
      reportsThisMonth,
      systemHealth: {
        database: dbHealth,
        // Process is serving this request — API is up for the admin path.
        api: "healthy" as const,
        integrations: integrationsHealth,
      },
      integrationCounts: {
        connected: connectedIntegrations,
        errored: erroredIntegrations,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "stats" });
  }
}
