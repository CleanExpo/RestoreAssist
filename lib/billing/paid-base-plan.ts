/**
 * L-2 — paid $99 base plan vs time-limited trial. Trial users keep Basic
 * reports; Enhanced / Optimised depth, tier saves, and PDF import require ACTIVE.
 *
 * Founding Trial (RA-7721) is the exception: the grant writes TRIAL plus
 * trialEndsAt 60 days out, and stamps FeatureEntitlement.stripePriceId with
 * COMPLIMENTARY_PRICE_ID. That workspace was promised the $99 base plan free
 * until trialEndsAt, so it must pass this gate while the window is current.
 * Plain TRIAL (no complimentary row) stays on L-2. PAST_DUE / CANCELED /
 * expired trialEndsAt do not.
 *
 * Copy and pure helpers live in paid-base-plan-copy.ts so client components
 * never import this file (prisma → pg in the browser bundle).
 */

import "server-only";

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { apiError } from "@/lib/api-errors";
import { COMPLIMENTARY_PRICE_ID } from "./founding-trial-grant";
import { isCurrentTrial } from "./trial-expired-pay-route";
import { PAID_BASE_PLAN_MESSAGE } from "./paid-base-plan-copy";

export {
  isPaidReportDepth,
  PAID_BASE_PLAN_MESSAGE,
  PAID_BASE_PLAN_UPGRADE_HREF,
} from "./paid-base-plan-copy";

async function hasComplimentaryFoundingGrant(ownerId: string): Promise<boolean> {
  const grant = await prisma.featureEntitlement.findFirst({
    where: {
      stripePriceId: COMPLIMENTARY_PRICE_ID,
      active: true,
      workspace: { ownerId },
    },
    select: { id: true },
  });
  return Boolean(grant);
}

export async function hasPaidBasePlan(userId: string): Promise<boolean> {
  const effective = await getEffectiveSubscription(userId);
  if (effective?.subscriptionStatus === "ACTIVE") return true;
  if (
    effective &&
    isCurrentTrial(effective.subscriptionStatus, effective.trialEndsAt) &&
    (await hasComplimentaryFoundingGrant(effective.id))
  ) {
    return true;
  }
  return false;
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
