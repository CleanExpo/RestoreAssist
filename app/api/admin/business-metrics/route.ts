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

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Plan-name → monthly price (AUD). Update when pricing changes.
// Values are best-effort: if a plan name doesn't match, MRR for that
// user is 0 — the API response surfaces the count of unmatched rows
// so the dashboard can flag pricing-table drift.
const PLAN_PRICE_AUD: Record<string, number> = {
  "Monthly Plan": 79,
  "Monthly Plan - 50 Reports": 79,
  "Yearly Plan": 790, // /12 handled below
};

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Paying customer count + MRR
  const activeSubscribers = await prisma.user.findMany({
    where: { subscriptionStatus: "ACTIVE" },
    select: { id: true, subscriptionPlan: true },
  });
  let mrr = 0;
  let planUnmatched = 0;
  for (const u of activeSubscribers) {
    const plan = u.subscriptionPlan ?? "";
    const price = PLAN_PRICE_AUD[plan];
    if (price === undefined) {
      planUnmatched++;
      continue;
    }
    // Yearly → monthly equivalent
    mrr += plan.toLowerCase().includes("year") ? price / 12 : price;
  }

  // 2. New trials this month
  const newTrialsThisMonth = await prisma.user.count({
    where: {
      subscriptionStatus: "TRIAL",
      createdAt: { gte: monthStart },
    },
  });

  // 3. Trial → paid conversion (users currently ACTIVE whose trial started this month)
  //    Heuristic: trialEndsAt is set for trial users and carries over to ACTIVE.
  const convertedThisMonth = await prisma.user.count({
    where: {
      subscriptionStatus: "ACTIVE",
      trialEndsAt: { gte: monthStart, lte: now },
    },
  });

  // 4. Churn this month (CANCELED or EXPIRED with subscriptionEndsAt in this month)
  const churnedThisMonth = await prisma.user.count({
    where: {
      subscriptionStatus: { in: ["CANCELED", "EXPIRED"] },
      subscriptionEndsAt: { gte: monthStart, lte: now },
    },
  });

  // 5. Failed charges (last 30 days) — count distinct Stripe webhook events
  let failedCharges30d = 0;
  try {
    failedCharges30d = await prisma.stripeWebhookEvent.count({
      where: {
        eventType: "invoice.payment_failed",
        createdAt: { gte: thirtyDaysAgo },
      },
    });
  } catch {
    // If StripeWebhookEvent model doesn't exist in this deployment, show -1
    failedCharges30d = -1;
  }

  // 6. Subscription deleted (last 30 days)
  let subscriptionsDeleted30d = 0;
  try {
    subscriptionsDeleted30d = await prisma.stripeWebhookEvent.count({
      where: {
        eventType: "customer.subscription.deleted",
        createdAt: { gte: thirtyDaysAgo },
      },
    });
  } catch {
    subscriptionsDeleted30d = -1;
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    currency: "AUD",
    mrr: Math.round(mrr * 100) / 100,
    payingCustomers: activeSubscribers.length,
    planUnmatched,
    newTrialsThisMonth,
    convertedThisMonth,
    churnedThisMonth,
    failedCharges30d,
    subscriptionsDeleted30d,
  });
}
