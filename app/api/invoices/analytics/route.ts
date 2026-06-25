import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  EXCLUDED_FROM_REVENUE,
  OUTSTANDING_STATUSES,
} from "@/lib/invoice-status";
import { apiError, fromException } from "@/lib/api-errors";

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

    const where = { userId: session.user.id };

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

    // Calculate monthly revenue for the last 12 months
    const monthlyRevenue = await prisma.$queryRaw<
      Array<{ month: string; revenue: bigint; count: bigint }>
    >`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "invoiceDate"), 'YYYY-MM') as month,
        SUM("totalIncGST") as revenue,
        COUNT(*) as count
      FROM "Invoice"
      WHERE "userId" = ${session.user.id}
        AND "status" != 'DRAFT'
        AND "status" != 'CANCELLED'
        AND "invoiceDate" >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', "invoiceDate")
      ORDER BY month DESC
    `;

    // Convert BigInt to Number for JSON serialization
    const monthlyRevenueFormatted = monthlyRevenue.map((row) => ({
      month: row.month,
      revenue: Number(row.revenue),
      count: Number(row.count),
    }));

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
