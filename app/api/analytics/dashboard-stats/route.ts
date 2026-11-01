import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { INACTIVE_INSPECTION_STATUSES } from "@/lib/inspections/active-status";
import { EXCLUDED_FROM_REVENUE } from "@/lib/invoice-status";

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

    const userId = session.user.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Active jobs: inspections that are not finished
    const activeJobs = await prisma.inspection.count({
      where: {
        userId,
        status: { notIn: [...INACTIVE_INSPECTION_STATUSES] },
      },
    });

    // 2. Avg drying days: completed inspections in last 30d.
    // RA-1323 — replaced findMany(take:5000) + JS reduce with a raw SQL AVG.
    // The old path pulled up to 5000 rows × 2 timestamps per dashboard load
    // just to compute a single scalar; at tenants with 1000+ completed
    // inspections it hit Postgres row reader + network transfer + Node
    // allocation on every page visit. dashboard-stats is called on every
    // dashboard home render.
    const avgDryingResult = await prisma.$queryRaw<
      Array<{ avg_days: number | null }>
    >`
      SELECT AVG(EXTRACT(EPOCH FROM "processedAt" - "createdAt")) / 86400 AS avg_days
      FROM "Inspection"
      WHERE "userId" = ${userId}
        AND "status" = 'COMPLETED'
        AND "processedAt" >= ${thirtyDaysAgo}
        AND "processedAt" IS NOT NULL
    `;
    const avgDryingDays = Number(avgDryingResult[0]?.avg_days ?? 0) || 0;

    // 3. Revenue MTD: sum of Invoice totalIncGST (cents) / 100 for current calendar month,
    // leaving out drafts and cancelled invoices
    const revenueMtdResult = await prisma.invoice.aggregate({
      where: {
        userId,
        invoiceDate: { gte: startOfMonth },
        status: { notIn: [...EXCLUDED_FROM_REVENUE] },
      },
      _sum: {
        totalIncGST: true,
      },
    });
    const revenueMtdAud = (revenueMtdResult._sum.totalIncGST ?? 0) / 100;

    // 4. Completion rate: (COMPLETED / total) * 100 for last 30d
    const [completedCount, totalCount] = await Promise.all([
      prisma.inspection.count({
        where: {
          userId,
          status: "COMPLETED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.inspection.count({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    const completionRatePct =
      totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return NextResponse.json({
      activeJobs,
      avgDryingDays,
      revenueMtdAud,
      completionRatePct,
    });
  } catch (error) {
    return fromException(request, error, { stage: "load" });
  }
}
