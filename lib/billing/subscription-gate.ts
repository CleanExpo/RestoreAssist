/**
 * RA-6940 — shared active-subscription gate for paid proxy routes.
 *
 * Mirrors the inline gate used by the report-generation routes
 * (app/api/reports/generate-enhanced/route.ts, generate-inspection-report):
 * CANCELED / PAST_DUE / EXPIRED users must not trigger requests that incur
 * real provider cost. Returns a 402 NextResponse to short-circuit with, or
 * null when the user may proceed — same calling convention as applyRateLimit.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Every member must exist in `enum SubscriptionStatus` (prisma/schema.prisma).
// "LIFETIME" used to sit here and is NOT an enum member, so it could never match
// a real row — lifetime customers are identified by the separate `lifetimeAccess`
// column, checked below. Guarded by a test that reads the schema.
export const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE"] as const;

export async function requireActiveSubscription(
  userId: string,
): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, lifetimeAccess: true },
  });

  // Lifetime buyers normally carry lifetimeAccess=true with a CANCELED/null
  // status — they never subscribed. Reading status alone refused them on every
  // route using this gate; the same omission in TrialBanner caused an Apple App
  // Review rejection. Matches the Live Teacher turn route, which had it right.
  const allowed =
    user?.lifetimeAccess === true ||
    ALLOWED_SUBSCRIPTION_STATUSES.includes(
      (user?.subscriptionStatus ?? "") as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
    );

  if (!user || !allowed) {
    return NextResponse.json(
      {
        error: "Active subscription required",
        upgradeRequired: true,
      },
      { status: 402 },
    );
  }

  return null;
}
