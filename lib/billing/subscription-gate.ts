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

// Every member must exist in `enum SubscriptionStatus` (prisma/schema.prisma).
// "LIFETIME" used to sit here and is NOT an enum member, so it could never match
// a real row — lifetime customers are identified by the separate `lifetimeAccess`
// column, which getEffectiveSubscription maps to ACTIVE. Guarded by a test that
// reads the schema.
export const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE"] as const;

export function isAllowedSubscriptionStatus(
  status: string | null | undefined,
): boolean {
  return ALLOWED_SUBSCRIPTION_STATUSES.includes(
    (status ?? "") as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
  );
}

/**
 * True when the user's effective plan (the organisation owner's for an
 * invited MANAGER/USER, their own otherwise) is TRIAL, ACTIVE or lifetime.
 * An unknown user, or an owner that cannot be found, is false.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const effective = await getEffectiveSubscription(userId);
  return isAllowedSubscriptionStatus(effective?.subscriptionStatus);
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
