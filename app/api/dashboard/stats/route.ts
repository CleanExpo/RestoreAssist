/**
 * GET /api/dashboard/stats
 * Returns 5 KPI values for the main dashboard summary cards.
 * All queries run in parallel via Promise.all for minimum latency.
 *
 * Returns:
 * {
 *   activeInspections:  { value, delta }   — inspections not yet finished
 *   moistureReadings7d: { value, delta }   — moisture readings in last 7 days
 *   equipmentItems:     { value, delta }   — IICRC-determined scope items (autoDetermined=true)
 *   completedThisMonth: { value, delta }   — inspections finished this calendar month
 *   createdToday:       { value, delta }   — inspections created in last 24h (field activity proxy)
 * }
 *
 * delta: percentage change vs equivalent prior period (or null if no prior data)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveTotalsReach } from "@/lib/auth/assert-tenancy";
import {
  INACTIVE_INSPECTION_STATUSES,
  finishedInPeriodWhere,
} from "@/lib/inspections/active-status";

// This route reads the session (which depends on request headers/cookies via
// getServerSession) so it cannot be statically prerendered at build time.
export const dynamic = "force-dynamic";

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

    // Every figure here counts jobs, not money, so it takes the read reach:
    // the whole organisation, technicians included (D-023).
    const reach = await resolveTotalsReach<Prisma.InspectionWhereInput>(
      session,
      "read",
    );
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }
    const jobs = reach.data;
    const now = new Date();

    // ── Time boundaries ──────────────────────────────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // ── Parallel queries ─────────────────────────────────────────
    const [
      activeNow,
      activePrev,
      moisture7d,
      moisture14to7d,
      equipmentNow,
      equipmentPrev,
      completedThisMonth,
      completedLastMonth,
      createdToday,
      createdYesterday,
    ] = await Promise.all([
      // 1. Active inspections (not finished)
      prisma.inspection.count({
        where: {
          ...jobs,
          status: { notIn: [...INACTIVE_INSPECTION_STATUSES] },
        },
      }),
      // 1b. Active prev (same calc 7 days ago — approximate: total minus completed then)
      prisma.inspection.count({
        where: {
          ...jobs,
          status: { notIn: [...INACTIVE_INSPECTION_STATUSES] },
          createdAt: { lte: sevenDaysAgo },
        },
      }),
      // 2. Moisture readings in last 7 days
      prisma.moistureReading.count({
        where: {
          inspection: jobs,
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      // 2b. Moisture readings 14→7 days ago (prior period for delta)
      prisma.moistureReading.count({
        where: {
          inspection: jobs,
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
      // 3. Equipment items: autoDetermined ScopeItems (IICRC equipment placed)
      prisma.scopeItem.count({
        where: {
          inspection: jobs,
          autoDetermined: true,
        },
      }),
      // 3b. Prior period (created before 7 days ago)
      prisma.scopeItem.count({
        where: {
          inspection: jobs,
          autoDetermined: true,
          createdAt: { lte: sevenDaysAgo },
        },
      }),
      // 4. Inspections finished this calendar month
      prisma.inspection.count({
        where: { ...jobs, ...finishedInPeriodWhere({ gte: startOfMonth }) },
      }),
      // 4b. Inspections finished last month
      prisma.inspection.count({
        where: {
          ...jobs,
          ...finishedInPeriodWhere({ gte: startOfLastMonth, lt: startOfMonth }),
        },
      }),
      // 5. Inspections created in last 24h (field activity proxy)
      prisma.inspection.count({
        where: {
          ...jobs,
          createdAt: { gte: oneDayAgo },
        },
      }),
      // 5b. Inspections created 48→24h ago
      prisma.inspection.count({
        where: {
          ...jobs,
          createdAt: { gte: twoDaysAgo, lt: oneDayAgo },
        },
      }),
    ]);

    // ── Delta calculation ─────────────────────────────────────────
    function calcDelta(current: number, prior: number): string | null {
      if (prior === 0) return current > 0 ? "+100%" : null;
      const pct = Math.round(((current - prior) / prior) * 100);
      return pct >= 0 ? `+${pct}%` : `${pct}%`;
    }

    return NextResponse.json({
      activeInspections: {
        value: activeNow,
        delta: calcDelta(activeNow, activePrev),
        label: "Active Inspections",
        sublabel: "Not yet completed",
        href: "/dashboard/inspections?status=active",
      },
      moistureReadings7d: {
        value: moisture7d,
        delta: calcDelta(moisture7d, moisture14to7d),
        label: "Moisture Readings",
        sublabel: "Last 7 days",
        href: "/dashboard/inspections",
      },
      equipmentItems: {
        value: equipmentNow,
        delta: calcDelta(equipmentNow, equipmentPrev),
        label: "Equipment Items",
        sublabel: "IICRC S500 placed",
        href: "/dashboard/inspections",
      },
      completedThisMonth: {
        value: completedThisMonth,
        delta: calcDelta(completedThisMonth, completedLastMonth),
        label: "Completed",
        sublabel: "This month",
        // The plain list: no single status pill can match a month-dated figure.
        href: "/dashboard/inspections",
      },
      createdToday: {
        value: createdToday,
        delta: calcDelta(createdToday, createdYesterday),
        label: "New Today",
        sublabel: "Inspections created",
        href: "/dashboard/inspections",
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "dashboard-stats:get" });
  }
}
