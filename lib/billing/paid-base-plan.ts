/**
 * L-2 — paid $99 base plan vs time-limited trial. Trial users keep Basic
 * reports; Enhanced / Optimised depth, tier saves, and PDF import require ACTIVE.
 *
 * Copy and pure helpers live in paid-base-plan-copy.ts so client components
 * never import this file (prisma → pg in the browser bundle).
 */

import "server-only";

import type { NextRequest } from "next/server";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { apiError } from "@/lib/api-errors";
import { PAID_BASE_PLAN_MESSAGE } from "./paid-base-plan-copy";

export {
  isPaidReportDepth,
  PAID_BASE_PLAN_MESSAGE,
  PAID_BASE_PLAN_UPGRADE_HREF,
} from "./paid-base-plan-copy";

export async function hasPaidBasePlan(userId: string): Promise<boolean> {
  const effective = await getEffectiveSubscription(userId);
  return effective?.subscriptionStatus === "ACTIVE";
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
