import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  // Re-validates role from DB to prevent stale JWT role from granting admin access
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const { user: adminUser } = auth;

  const { searchParams } = new URL(request.url);
  const month =
    searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const [year, monthNum] = month.split("-").map(Number);
  const from = new Date(year, monthNum - 1, 1);
  const to = new Date(year, monthNum, 0, 23, 59, 59);

  try {
    const usageWhere = {
      where: {
        timestamp: { gte: from, lte: to },
        user: { organizationId: adminUser!.organizationId },
      },
    } satisfies Prisma.UsageEventFindManyArgs;

    const [
      totalCostResult,
      pendingBillingCount,
      billedResult,
      failedCount,
      byEventTypeRows,
      byUserBillingRows,
      dailyRows,
    ] = await Promise.all([
      prisma.usageEvent.aggregate({
        ...usageWhere,
        _sum: { totalCost: true },
      }),
      prisma.usageEvent.count({
        where: { ...usageWhere.where, billingStatus: "pending" },
      }),
      prisma.usageEvent.aggregate({
        where: { ...usageWhere.where, billingStatus: "billed" },
        _sum: { totalCost: true },
      }),
      prisma.usageEvent.count({
        where: { ...usageWhere.where, billingStatus: "failed" },
      }),
      prisma.usageEvent.groupBy({
        by: ["eventType"],
        ...usageWhere,
        _count: { _all: true },
        _sum: { units: true, totalCost: true },
      }),
      prisma.usageEvent.groupBy({
        by: ["userId", "billingStatus"],
        ...usageWhere,
        _count: { _all: true },
        _sum: { totalCost: true },
      }),
      prisma.$queryRaw<
        Array<{
          date: Date | string;
          eventType: string;
          totalCost: number | null;
        }>
      >`
        SELECT
          DATE(ue."timestamp") as date,
          ue."eventType"::text as "eventType",
          SUM(ue."totalCost")::float as "totalCost"
        FROM "UsageEvent" ue
        INNER JOIN "User" u ON u."id" = ue."userId"
        WHERE ue."timestamp" >= ${from}
          AND ue."timestamp" <= ${to}
          AND u."organizationId" ${
            adminUser!.organizationId === null
              ? Prisma.sql`IS NULL`
              : Prisma.sql`= ${adminUser!.organizationId}`
          }
        GROUP BY DATE(ue."timestamp"), ue."eventType"
        ORDER BY date ASC
      `,
    ]);

    const totalCostMtd = totalCostResult._sum.totalCost ?? 0;
    const billedMtd = billedResult._sum.totalCost ?? 0;
    const byEventType = byEventTypeRows.map((row) => ({
      eventType: row.eventType,
      count: row._count._all,
      units: row._sum.units ?? 0,
      avgUnitCost:
        row._count._all > 0 ? (row._sum.totalCost ?? 0) / row._count._all : 0,
      totalCost: row._sum.totalCost ?? 0,
    }));

    const userIds = Array.from(
      new Set(byUserBillingRows.map((row) => row.userId)),
    );
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
            take: userIds.length,
          })
        : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    const byUserMap = new Map<
      string,
      {
        name: string;
        email: string;
        eventCount: number;
        totalCost: number;
        pending: number;
        billed: number;
        failed: number;
      }
    >();
    for (const row of byUserBillingRows) {
      const user = usersById.get(row.userId);
      const existing = byUserMap.get(row.userId) ?? {
        name: user?.name ?? "",
        email: user?.email ?? "",
        eventCount: 0,
        totalCost: 0,
        pending: 0,
        billed: 0,
        failed: 0,
      };
      byUserMap.set(row.userId, {
        ...existing,
        eventCount: existing.eventCount + row._count._all,
        totalCost: existing.totalCost + (row._sum.totalCost ?? 0),
        pending:
          existing.pending +
          (row.billingStatus === "pending" ? row._count._all : 0),
        billed:
          existing.billed +
          (row.billingStatus === "billed" ? row._count._all : 0),
        failed:
          existing.failed +
          (row.billingStatus === "failed" ? row._count._all : 0),
      });
    }
    const byUser = Array.from(byUserMap.entries()).map(([userId, agg]) => ({
      userId,
      ...agg,
    }));

    // Daily cost breakdown — last 30 days clamped to the month window
    const dailyMap = new Map<string, Record<string, number>>();
    for (const row of dailyRows) {
      const dateStr =
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : row.date;
      const existing = dailyMap.get(dateStr) ?? {};
      dailyMap.set(dateStr, {
        ...existing,
        [row.eventType]: (existing[row.eventType] ?? 0) + (row.totalCost ?? 0),
      });
    }
    const dailyCosts = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, costs]) => ({ date, costs }));

    return NextResponse.json({
      totalCostMtd,
      pendingBillingCount,
      billedMtd,
      failedCount,
      byEventType,
      byUser,
      dailyCosts,
    });
  } catch (error) {
    return fromException(request, error, { stage: "usage" });
  }
}
