/**
 * RA-6940 — shared active-subscription gate for paid proxy routes.
 *
 * Mirrors the inline gate used by the report-generation routes
 * (app/api/reports/generate-enhanced/route.ts, generate-inspection-report):
 * CANCELED / PAST_DUE / EXPIRED users must not trigger requests that incur
 * real provider cost. Returns a 402 NextResponse to short-circuit with, or
 * null when the user may proceed — same calling convention as applyRateLimit.
 *
 * RA-7893 — the plan that counts is the EFFECTIVE one: an invited technician
 * or manager (subscriptionStatus null by design) uses the business owner's
 * plan, via getEffectiveSubscription. An ADMIN, or a user with no
 * organisation (including one removed from it), is judged on their own row.
 */
import { NextResponse } from "next/server";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { isCurrentTrial } from "@/lib/billing/trial-expired-pay-route";

// Every member must exist in `enum SubscriptionStatus` (prisma/schema.prisma).
// "LIFETIME" used to sit here and is NOT an enum member, so it could never match
// a real row — lifetime customers are identified by the separate `lifetimeAccess`
// column, which getEffectiveSubscription maps to ACTIVE. Guarded by a test that
// reads the schema.
export const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE"] as const;

/**
 * True when an effective plan (from getEffectiveSubscription, which maps
 * lifetime access to ACTIVE) may run paid work: ACTIVE, or a TRIAL whose end
 * date has not passed (`isCurrentTrial`, which fails closed on a missing end
 * date). RA-7893 review: a TRIAL whose end date has passed but which the
 * sweep has not yet flipped to EXPIRED is NOT current.
 */
export function isEffectivePlanCurrent(
  effective:
    | { subscriptionStatus: string | null; trialEndsAt: Date | null }
    | null
    | undefined,
): boolean {
  if (!effective) return false;
  const status = effective.subscriptionStatus;
  if (
    !ALLOWED_SUBSCRIPTION_STATUSES.includes(
      (status ?? "") as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    return false;
  }
  return status === "ACTIVE" || isCurrentTrial(status, effective.trialEndsAt);
}

/**
 * True when the user's effective plan (the organisation owner's for an
 * invited MANAGER/USER, their own otherwise) is current — see
 * isEffectivePlanCurrent. An unknown user, or an owner that cannot be found,
 * is false.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  return isEffectivePlanCurrent(await getEffectiveSubscription(userId));
}

export async function requireActiveSubscription(
  userId: string,
): Promise<NextResponse | null> {
  // Lifetime buyers normally carry lifetimeAccess=true with a CANCELED/null
  // status — they never subscribed. getEffectiveSubscription maps that to
  // ACTIVE; reading status alone refused them (the same omission in
  // TrialBanner caused an Apple App Review rejection).
  if (!(await hasActiveSubscription(userId))) {
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
