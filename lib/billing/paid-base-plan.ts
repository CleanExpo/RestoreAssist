/**
 * L-2 — paid $99 base plan vs time-limited trial. Trial users keep Basic
 * reports; Enhanced / Optimised depth, tier saves, and PDF import require ACTIVE.
 */

import type { NextRequest } from "next/server";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { apiError } from "@/lib/api-errors";

export const PAID_BASE_PLAN_MESSAGE =
  "This feature is included with the paid RestoreAssist plan. Upgrade from trial to unlock Enhanced and Optimised reports and PDF import.";

export const PAID_BASE_PLAN_UPGRADE_HREF =
  "/billing/upgrade?reason=feature&feature=paid-plan";

export async function hasPaidBasePlan(userId: string): Promise<boolean> {
  const effective = await getEffectiveSubscription(userId);
  return effective?.subscriptionStatus === "ACTIVE";
}

export function isPaidReportDepth(level: string | null | undefined): boolean {
  const normalised = (level ?? "").trim().toLowerCase();
  return (
    normalised === "enhanced" ||
    normalised === "optimised" ||
    normalised === "optimized"
  );
}

export async function requirePaidBasePlan(
  request: NextRequest | undefined,
  userId: string,
) {
  if (await hasPaidBasePlan(userId)) return null;
  return apiError(request, {
    code: "PAYMENT_REQUIRED",
    message: PAID_BASE_PLAN_MESSAGE,
    status: 402,
  });
}
