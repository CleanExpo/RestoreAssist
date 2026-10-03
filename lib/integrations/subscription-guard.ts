/**
 * Subscription Guard for External Integrations
 * Requires an active paid subscription, persisted lifetime access, or a
 * current Founding Trial grant for the selected bookkeeping provider.
 */

import { prisma } from "@/lib/prisma";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";
import { BOOKKEEPING_SKU, isBookkeepingProvider } from "@/lib/billing/bookkeeping-addon";
import { getReadyWorkspaceOwnedBy } from "@/lib/entitlements/require-addon";
import { isIntegrationDevMode } from "./dev-mode";

export interface SubscriptionCheckResult {
  isAllowed: boolean;
  userId: string;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  /** Exact READY workspace that justified a complimentary trial allowance. */
  foundingTrialWorkspaceId?: string;
  error?: string;
}

/**
 * Check persisted paid or lifetime base access. A Founding Trial can use a
 * bookkeeping provider only while its own complimentary grant and trial are
 * both current; the add-on gate remains separate.
 * Required for accessing external integrations (Xero, QuickBooks, etc.)
 *
 * @param userId - The authenticated user ID to check
 * @param provider - Provider being accessed; omitted calls cannot use the
 *   Founding Trial exception.
 * @returns SubscriptionCheckResult with access decision and details
 */
export async function checkIntegrationAccess(
  userId: string,
  provider?: string,
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

  const select = {
    id: true,
    role: true,
    organization: { select: { ownerId: true } },
    subscriptionStatus: true,
    subscriptionPlan: true,
    subscriptionEndsAt: true,
    trialEndsAt: true,
    lifetimeAccess: true,
  } as const;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select,
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

  // RA-7893: the plan that counts is the business owner's. An invited
  // MANAGER/USER carries subscriptionStatus null by design. A user with no
  // organisation (including one removed from it) is judged on their own row.
  // A missing owner row fails closed.
  const ownerId = user.role === "ADMIN" ? user.id : user.organization?.ownerId ?? user.id;
  const owner = ownerId === user.id ? user : await prisma.user.findUnique({ where: { id: ownerId }, select });
  if (!owner) {
    return {
      isAllowed: false,
      userId,
      subscriptionStatus: null,
      subscriptionPlan: null,
      error:
        "Active subscription required. Upgrade to access external integrations.",
    };
  }
  const hasLifetimeAccess = owner.lifetimeAccess === true;
  const isExpired =
    owner.subscriptionEndsAt && new Date(owner.subscriptionEndsAt) < new Date();
  const hasPaidAccess = owner.subscriptionStatus === "ACTIVE" && !isExpired;

  let hasCurrentFoundingTrial = false;
  let foundingTrialWorkspaceId: string | undefined;
  if (!hasLifetimeAccess && !hasPaidAccess && isBookkeepingProvider(provider?.toUpperCase() ?? "")) {
    // The grant must sit on the READY workspace the organisation's owner OWNS
    // (invite acceptance never creates a WorkspaceMember row, so membership
    // cannot be required). Its persisted owner must be this owner.
    const trialEnd = owner.trialEndsAt?.getTime();
    if (owner.subscriptionStatus === "TRIAL" && typeof trialEnd === "number" &&
        Number.isFinite(trialEnd) && trialEnd > Date.now()) {
      const workspace = await getReadyWorkspaceOwnedBy(ownerId);
      if (workspace) {
        const grant = await prisma.featureEntitlement.findUnique({
          where: { workspaceId_sku: { workspaceId: workspace.id, sku: BOOKKEEPING_SKU } },
          select: {
            active: true, stripePriceId: true,
            workspace: { select: { ownerId: true, status: true } },
          },
        });
        hasCurrentFoundingTrial = grant?.active === true &&
          grant.stripePriceId === COMPLIMENTARY_PRICE_ID &&
          grant.workspace?.ownerId === ownerId && grant.workspace?.status === "READY";
        if (hasCurrentFoundingTrial) foundingTrialWorkspaceId = workspace.id;
      }
    }
  }

  const isAllowed = hasLifetimeAccess || hasPaidAccess || hasCurrentFoundingTrial;

  if (isExpired && !hasLifetimeAccess && !hasCurrentFoundingTrial) {
    return {
      isAllowed: false,
      userId,
      subscriptionStatus: owner.subscriptionStatus,
      subscriptionPlan: owner.subscriptionPlan,
      error: "Subscription has expired. Please renew to access integrations.",
    };
  }

  if (!isAllowed) {
    return {
      isAllowed: false,
      userId,
      subscriptionStatus: owner.subscriptionStatus,
      subscriptionPlan: owner.subscriptionPlan,
      error:
        "Active subscription required. Upgrade to access external integrations.",
    };
  }

  return {
    isAllowed: true,
    userId,
    subscriptionStatus: hasCurrentFoundingTrial ? "TRIAL" : owner.subscriptionStatus,
    subscriptionPlan: owner.subscriptionPlan,
    foundingTrialWorkspaceId,
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
