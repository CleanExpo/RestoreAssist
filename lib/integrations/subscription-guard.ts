/**
 * Subscription Guard for External Integrations
 * Requires an active paid subscription or persisted lifetime base access.
 */

import { prisma } from "@/lib/prisma";
import { isIntegrationDevMode } from "./dev-mode";

export interface SubscriptionCheckResult {
  isAllowed: boolean;
  userId: string;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  error?: string;
}

/**
 * Check persisted paid or lifetime base access; add-on gates remain separate.
 * Required for accessing external integrations (Xero, QuickBooks, etc.)
 *
 * @param userId - The user ID to check
 * @returns SubscriptionCheckResult with access decision and details
 */
export async function checkIntegrationAccess(
  userId: string,
): Promise<SubscriptionCheckResult> {
  // Bypass subscription check in development mode
  if (isIntegrationDevMode()) {
    return {
      isAllowed: true,
      userId,
      subscriptionStatus: "DEV_MODE",
      subscriptionPlan: "development",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionPlan: true,
      subscriptionEndsAt: true,
      lifetimeAccess: true,
    },
  });

  if (!user) {
    return {
      isAllowed: false,
      userId,
      subscriptionStatus: null,
      subscriptionPlan: null,
      error: "User not found",
    };
  }

  // Lifetime access is a persisted base grant, not a subscription plan label.
  // Ordinary TRIAL users still cannot access external integrations.
  const hasLifetimeAccess = user.lifetimeAccess === true;
  const allowedStatuses = ["ACTIVE"];
  const isAllowed = hasLifetimeAccess || allowedStatuses.includes(user.subscriptionStatus || "");

  // Also check if subscription hasn't expired
  const isExpired =
    user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) < new Date();

  if (isExpired && !hasLifetimeAccess) {
    return {
      isAllowed: false,
      userId,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionPlan: user.subscriptionPlan,
      error: "Subscription has expired. Please renew to access integrations.",
    };
  }

  if (!isAllowed) {
    return {
      isAllowed: false,
      userId,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionPlan: user.subscriptionPlan,
      error:
        "Active subscription required. Upgrade to access external integrations.",
    };
  }

  return {
    isAllowed: true,
    userId,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan,
  };
}

/**
 * Helper to create a standardized 403 response for subscription-gated features
 */
export function createSubscriptionRequiredResponse(
  checkResult: SubscriptionCheckResult,
) {
  return {
    error: checkResult.error || "Subscription required",
    upgradeRequired: true,
    currentStatus: checkResult.subscriptionStatus,
    message:
      "External integrations are available for paid subscribers. Please upgrade your plan to connect to Xero or Ascora.",
  };
}
