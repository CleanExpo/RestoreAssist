import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  EXCLUDED_FROM_REVENUE,
  OUTSTANDING_STATUSES,
} from "@/lib/invoice-status";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveTotalsReach } from "@/lib/auth/assert-tenancy";

const MONTHLY_BUCKETS = 13;

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

    const reach = await resolveTotalsReach<Prisma.InvoiceWhereInput>(
      session,
      "read-financial",
    );
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }
    const where = reach.data;

    // Calculate date ranges
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [
      totalRevenueResult,
      outstandingResult,
      draftTotalResult,
      paidThisMonthResult,
      overdueResult,
      statusCountRows,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          ...where,
          status: { notIn: [...EXCLUDED_FROM_REVENUE] },
        },
        _sum: { totalIncGST: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...where,
          status: { in: [...OUTSTANDING_STATUSES] },
        },
        _sum: { amountDue: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...where,
          status: "DRAFT",
        },
        _sum: { totalIncGST: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...where,
          status: "PAID",
          paidDate: {
            gte: firstDayOfMonth,
            lte: lastDayOfMonth,
          },
        },
        _sum: { totalIncGST: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...where,
          dueDate: { lt: startOfToday },
          amountDue: { gt: 0 },
          status: { in: [...OUTSTANDING_STATUSES] },
        },
        _sum: { amountDue: true },
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

    const totalRevenue = totalRevenueResult._sum.totalIncGST ?? 0;
    const outstanding = outstandingResult._sum.amountDue ?? 0;
    const draftTotal = draftTotalResult._sum.totalIncGST ?? 0;
    const paidThisMonthTotal = paidThisMonthResult._sum.totalIncGST ?? 0;
    const overdue = overdueResult._sum.amountDue ?? 0;
    const statusCounts = Object.fromEntries(
      statusCountRows.map((row) => [row.status, row._count._all]),
    );

    // Monthly revenue for the last 12 months: this month, then back, with the
    // oldest month starting twelve months ago to the day. One exact aggregate
    // per month rather than raw SQL, so tenancy stays in the one reach filter.
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setFullYear(now.getFullYear() - 1);
    const months = Array.from({ length: MONTHLY_BUCKETS }, (_, back) => {
      const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return {
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        gte: back === MONTHLY_BUCKETS - 1 ? twelveMonthsAgo : start,
        lt: new Date(now.getFullYear(), now.getMonth() - back + 1, 1),
      };
    });
    const monthlyTotals = await prisma.$transaction(
      months.map(({ gte, lt }) =>
        prisma.invoice.aggregate({
          where: {
            ...where,
            status: { notIn: [...EXCLUDED_FROM_REVENUE] },
            invoiceDate: { gte, lt },
          },
          _sum: { totalIncGST: true },
          _count: true,
        }),
      ),
      // One snapshot across all months, so an invoice moved mid-read cannot
      // land in two months or neither.
      { isolationLevel: "RepeatableRead" },
    );

    const monthlyRevenueFormatted = months.flatMap(({ month }, i) =>
      monthlyTotals[i]._count > 0
        ? [
            {
              month,
              revenue: monthlyTotals[i]._sum.totalIncGST ?? 0,
              count: monthlyTotals[i]._count,
            },
          ]
        : [],
    );

    return NextResponse.json({
      stats: {
        totalRevenue,
        outstanding,
        overdue,
        paidThisMonth: paidThisMonthTotal,
        draftTotal,
      },
      statusCounts,
      monthlyRevenue: monthlyRevenueFormatted,
    });
  } catch (error: any) {
    console.error("Error fetching invoice analytics:", error);
    return fromException(request, error, { stage: "analytics" });
  }
}
