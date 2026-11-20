import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveTotalsReach } from "@/lib/auth/assert-tenancy";
import {
  INACTIVE_INSPECTION_STATUSES,
  finishedJobWhere,
} from "@/lib/inspections/active-status";
import { EXCLUDED_FROM_REVENUE } from "@/lib/invoice-status";

const DRYING_SAMPLE_CAP = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

    const [jobsReach, moneyReach] = await Promise.all([
      resolveTotalsReach<Prisma.InspectionWhereInput>(session, "read"),
      resolveTotalsReach<Prisma.InvoiceWhereInput>(session, "read-financial"),
    ]);
    if (!jobsReach.ok || !moneyReach.ok) {
      const denied = !jobsReach.ok ? jobsReach : (moneyReach as typeof jobsReach & { ok: false });
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: denied.reason,
        status: denied.status,
      });
    }
    const jobs = jobsReach.data;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Active jobs: inspections that are not finished
    const activeJobs = await prisma.inspection.count({
      where: {
        ...jobs,
        status: { notIn: [...INACTIVE_INSPECTION_STATUSES] },
      },
    });

    // 2. Avg drying days: finished jobs that ended in the last 30 days.
    // A reversal of RA-1323's raw SQL, on purpose: tenancy must never be
    // hand-written in SQL, and two columns over a 30-day window is cheap.
    const dryingRows = await prisma.inspection.findMany({
      where: {
        AND: [
          jobs,
          finishedJobWhere(),
          {
            OR: [
              { completedAt: { gte: thirtyDaysAgo } },
              { completedAt: null, processedAt: { gte: thirtyDaysAgo } },
            ],
          },
        ],
      },
      select: { createdAt: true, completedAt: true, processedAt: true },
      orderBy: { createdAt: "desc" },
      take: DRYING_SAMPLE_CAP,
    });
    const avgDryingTruncated = dryingRows.length === DRYING_SAMPLE_CAP;
    if (avgDryingTruncated) {
      const owner = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      });
      console.warn("[dashboard-stats.drying_sample_truncated]", {
        route: "/api/analytics/dashboard-stats",
        organisationId: owner?.organizationId ?? null,
        cap: DRYING_SAMPLE_CAP,
      });
    }
    const dryingDays = dryingRows.flatMap((row) => {
      const ended = row.completedAt ?? row.processedAt;
      return ended ? [(ended.getTime() - row.createdAt.getTime()) / DAY_MS] : [];
    });
    const avgDryingDays = dryingDays.length
      ? dryingDays.reduce((total, days) => total + days, 0) / dryingDays.length
      : 0;

    // 3. Revenue MTD: sum of Invoice totalIncGST (cents) / 100 for current calendar month,
    // leaving out drafts and cancelled invoices
    const revenueMtdResult = await prisma.invoice.aggregate({
      where: {
        ...moneyReach.data,
        invoiceDate: { gte: startOfMonth },
        status: { notIn: [...EXCLUDED_FROM_REVENUE] },
      },
      _sum: {
        totalIncGST: true,
      },
    });
    const revenueMtdAud = (revenueMtdResult._sum.totalIncGST ?? 0) / 100;

    // 4. Completion rate: of jobs created in the last 30d, how many finished
    const [completedCount, totalCount] = await Promise.all([
      prisma.inspection.count({
        where: {
          ...jobs,
          ...finishedJobWhere(),
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.inspection.count({
        where: {
          ...jobs,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    const completionRatePct =
      totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return NextResponse.json({
      activeJobs,
      avgDryingDays,
      avgDryingTruncated,
      revenueMtdAud,
      completionRatePct,
    });
  } catch (error) {
    return fromException(request, error, { stage: "load" });
  }
}
