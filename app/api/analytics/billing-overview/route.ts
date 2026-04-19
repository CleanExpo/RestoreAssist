import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { PRICING_CONFIG } from "@/lib/pricing";

// RA-1320 — module-scope response cache. billing-overview fires 11
// parallel queries, 3 of which groupBy/aggregate over the full User
// table. At 100k users each admin-dashboard refresh is expensive and
// connection-pool-heavy. Cache the response for 60s so repeated admin
// refreshes share a single computation. Cache is stale-while-revalidate
// would be better but this module has no Redis dependency — 60s
// in-memory is the Pareto-optimal mitigation.
type CachedResponse = { data: unknown; expiresAt: number };
let cachedResponse: CachedResponse | null = null;
const CACHE_TTL_MS = 60_000;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    // RA-1320 — serve from cache if fresh
    if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
      return NextResponse.json(cachedResponse.data, {
        headers: { "X-Cache": "HIT" },
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Fetch all data in parallel
    const [
      subscriptionCounts,
      activeMonthly,
      activeYearly,
      trialsExpiringSoon,
      canceledLast30,
      addonRevenue,
      addonRevenuePrev,
      recentAddons,
      totalUsers,
      creditStats,
      monthlyRevenueTrend,
    ] = await Promise.all([
      // Subscription distribution
      prisma.user.groupBy({
        by: ["subscriptionStatus"],
        _count: { id: true },
        where: { subscriptionStatus: { not: null } },
      }),

      // Active monthly subscribers
      prisma.user.count({
        where: {
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: "Monthly Plan",
        },
      }),

      // Active yearly subscribers
      prisma.user.count({
        where: {
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: "Yearly Plan",
        },
      }),

      // RA-1330 — previously fetched up to 1000 trial users just to
      // count those expiring in the next 7 days. Replace with a direct
      // count query so we transfer one scalar instead of up to 1000
      // rows × 3 fields each on every billing-overview page load.
      prisma.user.count({
        where: {
          subscriptionStatus: "TRIAL",
          trialEndsAt: {
            gt: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Users who canceled in last 30 days
      prisma.user.count({
        where: {
          subscriptionStatus: "CANCELED",
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),

      // Add-on revenue (completed purchases, last 30 days)
      prisma.addonPurchase.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: {
          status: "COMPLETED",
          purchasedAt: { gte: thirtyDaysAgo },
        },
      }),

      // Add-on revenue (previous 30 days for comparison)
      prisma.addonPurchase.aggregate({
        _sum: { amount: true },
        where: {
          status: "COMPLETED",
          purchasedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),

      // Recent add-on purchases (last 10)
      prisma.addonPurchase.findMany({
        where: { status: "COMPLETED" },
        orderBy: { purchasedAt: "desc" },
        take: 10,
        select: {
          addonName: true,
          amount: true,
          currency: true,
          purchasedAt: true,
          user: { select: { name: true, email: true } },
        },
      }),

      // Total registered users
      prisma.user.count(),

      // Credit usage aggregate
      prisma.user.aggregate({
        _sum: {
          totalCreditsUsed: true,
          creditsRemaining: true,
        },
        where: {
          subscriptionStatus: { in: ["ACTIVE", "TRIAL"] },
        },
      }),

      // Monthly revenue trend (add-on purchases by month, last 6 months)
      prisma.$queryRaw<
        Array<{ month: string; addon_revenue: number; purchase_count: bigint }>
      >`
        SELECT
          to_char("purchasedAt", 'YYYY-MM') as month,
          SUM(amount) as addon_revenue,
          COUNT(*) as purchase_count
        FROM "AddonPurchase"
        WHERE status = 'COMPLETED'
          AND "purchasedAt" >= NOW() - INTERVAL '6 months'
        GROUP BY to_char("purchasedAt", 'YYYY-MM')
        ORDER BY month ASC
      `.catch(
        () =>
          [] as Array<{
            month: string;
            addon_revenue: number;
            purchase_count: bigint;
          }>,
      ),
    ]);

    // Calculate MRR
    const monthlyMRR = activeMonthly * PRICING_CONFIG.pricing.monthly.amount;
    const yearlyMRR =
      activeYearly * (PRICING_CONFIG.pricing.yearly.amount / 12);
    const totalMRR = monthlyMRR + yearlyMRR;

    // Calculate ARR
    const totalARR = totalMRR * 12;

    // Subscription distribution map
    const statusMap: Record<string, number> = {};
    for (const item of subscriptionCounts) {
      if (item.subscriptionStatus) {
        statusMap[item.subscriptionStatus] = item._count.id;
      }
    }

    const activeCount = statusMap["ACTIVE"] || 0;
    const trialCount = statusMap["TRIAL"] || 0;
    const canceledCount = statusMap["CANCELED"] || 0;
    const expiredCount = statusMap["EXPIRED"] || 0;
    const pastDueCount = statusMap["PAST_DUE"] || 0;

    // Trial conversion: users who were on trial and are now active
    // Approximate by looking at active users who have a trialEndsAt in the past
    const convertedTrials = await prisma.user.count({
      where: {
        subscriptionStatus: "ACTIVE",
        trialEndsAt: { not: null },
      },
    });
    const totalEverTrialed = convertedTrials + trialCount + canceledCount;
    const conversionRate =
      totalEverTrialed > 0
        ? Math.round((convertedTrials / totalEverTrialed) * 100)
        : 0;

    // Churn rate (canceled last 30 days / active at start of period)
    const activeAtPeriodStart = activeCount + canceledLast30;
    const churnRate =
      activeAtPeriodStart > 0
        ? Math.round((canceledLast30 / activeAtPeriodStart) * 100 * 10) / 10
        : 0;

    // Add-on revenue change
    const addonRevenueThisMonth = addonRevenue._sum.amount || 0;
    const addonRevenuePrevMonth = addonRevenuePrev._sum.amount || 0;
    const addonRevenueChange =
      addonRevenuePrevMonth > 0
        ? Math.round(
            ((addonRevenueThisMonth - addonRevenuePrevMonth) /
              addonRevenuePrevMonth) *
              100,
          )
        : addonRevenueThisMonth > 0
          ? 100
          : 0;

    // Trials expiring soon (within 7 days) — resolved at fetch time by the
    // count query above (RA-1330). Kept as a named local for readability.

    // Build monthly revenue trend with subscription MRR estimate
    const revenueTrend = (monthlyRevenueTrend as any[]).map((row: any) => ({
      month: row.month,
      addonRevenue: Number(row.addon_revenue) || 0,
      purchaseCount: Number(row.purchase_count) || 0,
      // MRR is an estimate - current MRR applied to each month
      estimatedMRR: totalMRR,
    }));

    const responseBody = {
      mrr: {
        total: totalMRR,
        monthly: monthlyMRR,
        yearly: yearlyMRR,
        formatted: `$${totalMRR.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
      },
      arr: {
        total: totalARR,
        formatted: `$${totalARR.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
      },
      subscriptions: {
        active: activeCount,
        trial: trialCount,
        canceled: canceledCount,
        expired: expiredCount,
        pastDue: pastDueCount,
        total:
          activeCount +
          trialCount +
          canceledCount +
          expiredCount +
          pastDueCount,
        byPlan: {
          monthly: activeMonthly,
          yearly: activeYearly,
        },
      },
      metrics: {
        conversionRate,
        churnRate,
        trialsExpiringSoon,
        canceledLast30Days: canceledLast30,
      },
      addonRevenue: {
        thisMonth: addonRevenueThisMonth,
        previousMonth: addonRevenuePrevMonth,
        change: addonRevenueChange,
        purchaseCount: addonRevenue._count.id,
        formatted: `$${addonRevenueThisMonth.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
      },
      creditUsage: {
        totalUsed: creditStats._sum.totalCreditsUsed || 0,
        totalRemaining: creditStats._sum.creditsRemaining || 0,
      },
      recentAddons: recentAddons.map((a) => ({
        addonName: a.addonName,
        amount: a.amount,
        currency: a.currency,
        purchasedAt: a.purchasedAt,
        userName: a.user.name || a.user.email,
      })),
      revenueTrend,
      totalUsers,
    };

    // RA-1320 — cache the computed response for 60s
    cachedResponse = {
      data: responseBody,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return NextResponse.json(responseBody, { headers: { "X-Cache": "MISS" } });
  } catch (error) {
    console.error("Error fetching billing overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing overview" },
      { status: 500 },
    );
  }
}
