/**
 * RA-1357 — Business observability metrics.
 *
 * Returns the core KPIs the team can't operate without:
 *   - MRR (active subscriptions × monthly-equivalent price)
 *   - Trial → paid conversion (this month)
 *   - Churn (this month, ACTIVE → CANCELED/EXPIRED)
 *   - Failed charges (last 30 days, Stripe webhook events)
 *   - New trials (this month)
 *   - Paying customer count
 *
 * Admin-only. Prices are read from user.subscriptionPlan (matches the
 * Stripe plan name set by the webhook). A simple plan → price lookup
 * lives below — update when pricing changes.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";

// Plan-name → monthly price (AUD). Update when pricing changes.
// Values are best-effort: if a plan name doesn't match, MRR for that
// user is 0 — the API response surfaces the count of unmatched rows
// so the dashboard can flag pricing-table drift.
const PLAN_PRICE_AUD: Record<string, number> = {
  "Monthly Plan": 79,
  "Monthly Plan - 50 Reports": 79,
  "Yearly Plan": 790, // /12 handled below
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. MRR via groupBy — one aggregation query instead of a full table scan
    const planGroups = await prisma.user.groupBy({
      by: ["subscriptionPlan"],
      where: { subscriptionStatus: "ACTIVE" },
      _count: { id: true },
    });
    let mrr = 0;
    let planUnmatched = 0;
    let payingCustomers = 0;
    for (const group of planGroups) {
      const plan = group.subscriptionPlan ?? "";
      const count = group._count.id;
      payingCustomers += count;
      const price = PLAN_PRICE_AUD[plan];
      if (price === undefined) {
        planUnmatched += count;
        continue;
      }
      mrr += (plan.toLowerCase().includes("year") ? price / 12 : price) * count;
    }

    // RA-6794. Blocked-customer summary — one extra groupBy on the same
    // subscriptionStatus column (no new heavy query). Surfaces how many
    // customers are currently in a non-paying state for ops follow-up.
    const blockedGroups = await prisma.user.groupBy({
      by: ["subscriptionStatus"],
      where: { subscriptionStatus: { in: ["PAST_DUE", "EXPIRED", "CANCELED"] } },
      _count: { id: true },
    });
    const blockedCustomers = { pastDue: 0, expired: 0, canceled: 0 };
    for (const group of blockedGroups) {
      const count = group._count.id;
      switch (group.subscriptionStatus) {
        case "PAST_DUE":
          blockedCustomers.pastDue = count;
          break;
        case "EXPIRED":
          blockedCustomers.expired = count;
          break;
        case "CANCELED":
          blockedCustomers.canceled = count;
          break;
      }
    }

    // 2–4. Independent counts — run in parallel
    const [newTrialsThisMonth, convertedThisMonth, churnedThisMonth] =
      await Promise.all([
        prisma.user.count({
          where: {
            subscriptionStatus: "TRIAL",
            createdAt: { gte: monthStart },
          },
        }),
        prisma.user.count({
          where: {
            subscriptionStatus: "ACTIVE",
            trialEndsAt: { gte: monthStart, lte: now },
          },
        }),
        prisma.user.count({
          where: {
            subscriptionStatus: { in: ["CANCELED", "EXPIRED"] },
            subscriptionEndsAt: { gte: monthStart, lte: now },
          },
        }),
      ]);

    // 5–6. Stripe webhook counts — independent, parallel, each may not exist
    const [failedCharges30d, subscriptionsDeleted30d] = await Promise.all([
      prisma.stripeWebhookEvent
        .count({
          where: {
            eventType: "invoice.payment_failed",
            createdAt: { gte: thirtyDaysAgo },
          },
        })
        .catch(() => -1),
      prisma.stripeWebhookEvent
        .count({
          where: {
            eventType: "customer.subscription.deleted",
            createdAt: { gte: thirtyDaysAgo },
          },
        })
        .catch(() => -1),
    ]);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      currency: "AUD",
      mrr: Math.round(mrr * 100) / 100,
      payingCustomers,
      planUnmatched,
      newTrialsThisMonth,
      convertedThisMonth,
      churnedThisMonth,
      failedCharges30d,
      subscriptionsDeleted30d,
      blockedCustomers,
    });
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}
