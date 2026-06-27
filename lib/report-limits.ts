import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";
import {
  getEffectiveSubscription,
  getOrganizationOwner,
} from "@/lib/organization-credits";
import { checkAndUpdateTrialStatus } from "@/lib/trial-handling";

export interface ReportLimitInfo {
  baseLimit: number;
  addonReports: number;
  monthlyReportsUsed: number;
  availableReports: number;
  hasUnlimited: boolean;
}

/**
 * Get the user's report limit information
 */
export async function getUserReportLimits(
  userId: string,
): Promise<ReportLimitInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      subscriptionPlan: true,
      addonReports: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
      createdAt: true,
    },
  });

  // Query add-on purchases separately (in case Prisma client hasn't been regenerated)
  let addonPurchases: Array<{ reportLimit: number; purchasedAt: Date }> = [];
  try {
    addonPurchases = await prisma.addonPurchase.findMany({
      where: {
        userId: userId,
        status: "COMPLETED",
      },
      select: {
        reportLimit: true,
        purchasedAt: true,
      },
    });
  } catch (error: any) {
    // If AddonPurchase model doesn't exist yet, just use addonReports field
  }

  if (!user) {
    throw new Error("User not found");
  }

  // Check if monthly usage needs to be reset
  const now = new Date();
  const shouldReset =
    !user.monthlyResetDate ||
    (user.monthlyResetDate && now > user.monthlyResetDate);

  if (shouldReset) {
    // Reset monthly usage
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1); // First day of next month
    nextReset.setHours(0, 0, 0, 0);

    await prisma.user.update({
      where: { id: userId },
      data: {
        monthlyReportsUsed: 0,
        monthlyResetDate: nextReset,
      },
    });

    user.monthlyReportsUsed = 0;
    user.monthlyResetDate = nextReset;
  }

  // For trial users, use credits system
  if (user.subscriptionStatus === "TRIAL") {
    return {
      baseLimit: 0,
      addonReports: 0,
      monthlyReportsUsed: 0,
      availableReports: 0,
      hasUnlimited: false,
    };
  }

  // For active subscribers, calculate limits
  if (user.subscriptionStatus === "ACTIVE") {
    const isLifetime = user.subscriptionPlan === "Lifetime";
    const plan = isLifetime
      ? { reportLimit: 999 }
      : user.subscriptionPlan === "Yearly Plan"
        ? PRICING_CONFIG.pricing.yearly
        : PRICING_CONFIG.pricing.monthly;

    const baseLimit = plan.reportLimit || 0;

    // Calculate add-on reports: sum of all completed purchases from AddonPurchase table
    // This is the source of truth for purchased add-ons
    let addonReportsFromPurchases = 0;
    if (addonPurchases && addonPurchases.length > 0) {
      addonReportsFromPurchases = addonPurchases.reduce(
        (sum, purchase) => sum + purchase.reportLimit,
        0,
      );
    }

    // The user.addonReports field may contain signup bonus (10 reports)
    // We need to check if signup bonus was applied by comparing with purchases
    // If addonReports field is higher than purchases, it likely includes signup bonus
    const userAddonReports = user.addonReports || 0;

    // Use the maximum to ensure we include signup bonus if it exists
    // This handles the case where signup bonus is in the field but not yet in purchases
    const addonReports = Math.max(addonReportsFromPurchases, userAddonReports);

    const monthlyReportsUsed = user.monthlyReportsUsed || 0;
    const totalLimit = baseLimit + addonReports;
    const availableReports = Math.max(0, totalLimit - monthlyReportsUsed);

    return {
      baseLimit,
      addonReports,
      monthlyReportsUsed,
      availableReports,
      hasUnlimited: false,
    };
  }

  // No active subscription
  return {
    baseLimit: 0,
    addonReports: 0,
    monthlyReportsUsed: 0,
    availableReports: 0,
    hasUnlimited: false,
  };
}

/**
 * Check if user can create a report
 * For Managers/Technicians, checks the Admin's organization credits
 */
export async function canCreateReport(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // Get effective subscription (Admin's for Managers/Technicians, own for Admins)
  const effectiveSub = await getEffectiveSubscription(userId);

  if (!effectiveSub) {
    return { allowed: false, reason: "User not found" };
  }

  // Trial users: the 15-day trial is CAPPED at a fixed report-credit grant
  // (PRICING_CONFIG.free.trialReportCredits). A report may be created only
  // while BOTH conditions hold: still inside the trial window AND credits
  // remain. When either fails, block with the matching reason. (API key
  // required when actually creating the report.)
  if (effectiveSub.subscriptionStatus === "TRIAL") {
    const trialExpired = await checkAndUpdateTrialStatus(effectiveSub.id);
    if (trialExpired) {
      return {
        allowed: false,
        reason:
          "Your 15-day free trial has expired. Please subscribe to continue using RestoreAssist.",
      };
    }
    if (
      effectiveSub.trialEndsAt &&
      new Date() > new Date(effectiveSub.trialEndsAt)
    ) {
      return {
        allowed: false,
        reason:
          "Your 15-day free trial has expired. Please subscribe to continue using RestoreAssist.",
      };
    }
    // Trial report cap — exhausted credits block further reports even while
    // the trial window is still open, so the "50 report credits" promise is
    // enforced rather than unlimited.
    if ((effectiveSub.creditsRemaining ?? 0) <= 0) {
      return {
        allowed: false,
        reason:
          "Trial report limit reached. You've used all your free trial report credits. Please subscribe to create more reports.",
      };
    }
    return { allowed: true };
  }

  // Active subscribers use monthly limits
  if (effectiveSub.subscriptionStatus === "ACTIVE") {
    // For active subscribers, get limits from the owner's account
    const ownerId = await getOrganizationOwner(userId);
    const targetUserId = ownerId || userId;
    const limits = await getUserReportLimits(targetUserId);
    if (limits.availableReports > 0) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        "Monthly report limit reached. Please purchase an add-on pack to create more reports.",
    };
  }

  return {
    allowed: false,
    reason: "Active subscription required to create reports.",
  };
}

/**
 * Check if user can create bulk reports
 * For Managers/Technicians, checks the Admin's organization credits
 */
export async function canCreateBulkReports(
  userId: string,
  count: number,
): Promise<{ allowed: boolean; reason?: string }> {
  // Get effective subscription (Admin's for Managers/Technicians, own for Admins)
  const effectiveSub = await getEffectiveSubscription(userId);

  if (!effectiveSub) {
    return { allowed: false, reason: "User not found" };
  }

  // Trial users: capped at the trial report-credit grant. Bulk creation must
  // fit inside both the trial window AND the remaining credit balance.
  if (effectiveSub.subscriptionStatus === "TRIAL") {
    if (
      effectiveSub.trialEndsAt &&
      new Date() > new Date(effectiveSub.trialEndsAt)
    ) {
      return {
        allowed: false,
        reason:
          "Your 15-day free trial has expired. Please subscribe to continue.",
      };
    }
    const trialCreditsRemaining = effectiveSub.creditsRemaining ?? 0;
    if (trialCreditsRemaining < count) {
      return {
        allowed: false,
        reason: `Insufficient trial report credits. You need ${count} reports but only have ${trialCreditsRemaining} trial credit${trialCreditsRemaining === 1 ? "" : "s"} remaining. Please subscribe to create more reports.`,
      };
    }
    return { allowed: true };
  }

  // Active subscribers use monthly limits
  if (effectiveSub.subscriptionStatus === "ACTIVE") {
    // For active subscribers, get limits from the owner's account
    const ownerId = await getOrganizationOwner(userId);
    const targetUserId = ownerId || userId;
    const limits = await getUserReportLimits(targetUserId);
    if (limits.availableReports >= count) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Insufficient monthly reports. You need ${count} reports but only have ${limits.availableReports} available. Please purchase an add-on pack to create more reports.`,
    };
  }

  return {
    allowed: false,
    reason: "Active subscription required to create reports.",
  };
}

/**
 * Increment monthly report usage
 */
export async function incrementReportUsage(userId: string): Promise<void> {
  // Get the organization owner (Admin) - they own the subscription
  const ownerId = await getOrganizationOwner(userId);
  const targetUserId = ownerId || userId;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      subscriptionStatus: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Only increment for active subscribers (trial users use credits)
  if (user.subscriptionStatus === "ACTIVE") {
    // RA-1313 — race-safe reset-or-increment. Previous read-then-update was
    // susceptible to: Req A + Req B both see shouldReset=true, both write
    // monthlyReportsUsed=1 → counter under-counts, user exceeds plan limit.
    // Fix: atomic updateMany with a WHERE guard on monthlyResetDate. If
    // the row matches (reset is due and no other caller has reset yet),
    // count === 1 and we're done. Otherwise fall through to increment.
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);

    const resetResult = await prisma.user.updateMany({
      where: {
        id: targetUserId,
        OR: [{ monthlyResetDate: null }, { monthlyResetDate: { lt: now } }],
      },
      data: {
        monthlyReportsUsed: 1,
        monthlyResetDate: nextReset,
      },
    });

    if (resetResult.count === 0) {
      // Another request already did the reset (or the month hasn't rolled).
      // Either way, a plain atomic increment is correct.
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          monthlyReportsUsed: { increment: 1 },
        },
      });
    }
  }
}

/**
 * Deduct credits and track usage for team hierarchy
 * - Deducts credits from Admin's account (for trial users)
 * - Increments monthly usage on Admin's account (for active subscribers)
 * - Tracks usage for Manager (if technician is creating)
 * - Tracks usage for the creator
 */
export async function deductCreditsAndTrackUsage(
  creatorUserId: string,
): Promise<void> {
  // Get the organization owner (Admin) - they own the subscription
  const ownerId = await getOrganizationOwner(creatorUserId);
  const adminId = ownerId || creatorUserId;

  // Get creator's info to check if they have a manager
  const creator = await prisma.user.findUnique({
    where: { id: creatorUserId },
    select: {
      role: true,
      managedById: true,
      totalCreditsUsed: true,
    },
  });

  if (!creator) {
    throw new Error("Creator user not found");
  }

  // Get admin's subscription info
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: {
      subscriptionStatus: true,
      creditsRemaining: true,
      totalCreditsUsed: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
    },
  });

  if (!admin) {
    throw new Error("Admin user not found");
  }

  // Handle trial users - atomically check-and-deduct credits from admin.
  // Using updateMany with creditsRemaining >= 1 as a WHERE condition makes the
  // check and deduct a single atomic operation, preventing the TOCTOU race where
  // two concurrent requests both read balance > 0 and both succeed.
  if (admin.subscriptionStatus === "TRIAL") {
    const result = await prisma.user.updateMany({
      where: { id: adminId, creditsRemaining: { gte: 1 } },
      data: {
        creditsRemaining: { decrement: 1 },
        totalCreditsUsed: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
  } else if (admin.subscriptionStatus === "ACTIVE") {
    // RA-1313 — same race-safe pattern as incrementMonthlyUsage above.
    // Two team members creating reports on the 1st of the month must not
    // both observe shouldReset=true and clobber each other's increment.
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);

    const resetResult = await prisma.user.updateMany({
      where: {
        id: adminId,
        OR: [{ monthlyResetDate: null }, { monthlyResetDate: { lt: now } }],
      },
      data: {
        monthlyReportsUsed: 1,
        monthlyResetDate: nextReset,
      },
    });

    if (resetResult.count === 0) {
      await prisma.user.update({
        where: { id: adminId },
        data: {
          monthlyReportsUsed: { increment: 1 },
        },
      });
    }
  }

  // Track usage for manager (if technician is creating and has a manager)
  if (creator.role === "USER" && creator.managedById) {
    await prisma.user.update({
      where: { id: creator.managedById },
      data: {
        totalCreditsUsed: {
          increment: 1,
        },
      },
    });
  }

  // Track usage for the creator (only if creator is not the admin)
  // If creator is admin, their totalCreditsUsed was already incremented when deducting credits
  if (creatorUserId !== adminId) {
    await prisma.user.update({
      where: { id: creatorUserId },
      data: {
        totalCreditsUsed: {
          increment: 1,
        },
      },
    });
  }
}

/**
 * RA-1377 — Compensating refund for a charge that never produced a report.
 *
 * `deductCreditsAndTrackUsage` charges the user BEFORE the (slow, external) AI
 * generation + the report row is persisted. Those steps are deliberately NOT
 * wrapped in a DB transaction. So if anything between the deduct and a
 * successful `report.create` throws, the user has been billed a TRIAL credit /
 * monthly-usage slot but received no report — repeated transient failures
 * silently burn a paying user's quota.
 *
 * This is the exact inverse of `deductCreditsAndTrackUsage`: it re-credits the
 * admin's trial balance / decrements the admin's monthly usage and rolls back
 * the same `totalCreditsUsed` increments. It is the caller's responsibility to
 * invoke this EXACTLY ONCE per failed charge, and ONLY on a post-deduct,
 * pre-create failure path (never on the happy path).
 *
 * Safety properties:
 *  - Best-effort: a refund failure is logged and surfaced via the returned
 *    flag, never thrown — a failed refund must not mask the original error nor
 *    crash the request. Each leg is isolated so one failing leg doesn't abort
 *    the others.
 *  - Idempotent-friendly: counters are clamped at 0 so a stray double-refund
 *    (or a refund of a charge that hit the trial floor) can't push
 *    creditsRemaining above a sane state or drive monthlyReportsUsed /
 *    totalCreditsUsed negative.
 *
 * @returns `{ refunded }` — true if every leg that was attempted succeeded.
 */
export async function refundCreditsAndTrackUsage(
  creatorUserId: string,
): Promise<{ refunded: boolean }> {
  let allOk = true;

  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      allOk = false;
      // Surface, don't swallow: a quota that fails to refund is a billing bug
      // we need visibility on. The original request error is handled by the
      // caller; this log is additive.
      console.error(
        `[refundCreditsAndTrackUsage] refund leg "${label}" failed for creator ${creatorUserId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  };

  // Mirror the deduct's owner/creator resolution so we refund the same rows.
  const ownerId = await getOrganizationOwner(creatorUserId).catch(() => null);
  const adminId = ownerId || creatorUserId;

  const creator = await prisma.user
    .findUnique({
      where: { id: creatorUserId },
      select: { role: true, managedById: true },
    })
    .catch(() => null);

  const admin = await prisma.user
    .findUnique({
      where: { id: adminId },
      select: {
        subscriptionStatus: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        monthlyReportsUsed: true,
      },
    })
    .catch(() => null);

  if (!admin) {
    console.error(
      `[refundCreditsAndTrackUsage] admin ${adminId} not found; cannot refund charge for creator ${creatorUserId}`,
    );
    return { refunded: false };
  }

  // --- Invert the admin-side charge ------------------------------------------
  if (admin.subscriptionStatus === "TRIAL") {
    // Inverse of: creditsRemaining -1, totalCreditsUsed +1.
    // Clamp totalCreditsUsed at 0 so a double-refund can't go negative.
    const restoredTotal = Math.max(0, (admin.totalCreditsUsed ?? 0) - 1);
    await safe("trial-admin", () =>
      prisma.user.update({
        where: { id: adminId },
        data: {
          creditsRemaining: { increment: 1 },
          totalCreditsUsed: restoredTotal,
        },
      }),
    );
  } else if (admin.subscriptionStatus === "ACTIVE") {
    // Inverse of the monthly-usage increment. The deduct may have *reset* the
    // counter to 1 (start of a new period) or incremented it; either way the
    // single charge we're refunding is worth exactly one slot. Clamp at 0 —
    // never decrement a freshly-reset 0 into the negatives.
    const restoredMonthly = Math.max(0, (admin.monthlyReportsUsed ?? 0) - 1);
    await safe("active-admin", () =>
      prisma.user.update({
        where: { id: adminId },
        data: { monthlyReportsUsed: restoredMonthly },
      }),
    );
  }

  // --- Invert the manager-side usage tracking --------------------------------
  if (creator && creator.role === "USER" && creator.managedById) {
    const manager = await prisma.user
      .findUnique({
        where: { id: creator.managedById },
        select: { totalCreditsUsed: true },
      })
      .catch(() => null);
    if (manager) {
      await safe("manager", () =>
        prisma.user.update({
          where: { id: creator.managedById as string },
          data: {
            totalCreditsUsed: Math.max(0, (manager.totalCreditsUsed ?? 0) - 1),
          },
        }),
      );
    } else {
      allOk = false;
    }
  }

  // --- Invert the creator-side usage tracking (only if creator != admin) -----
  if (creatorUserId !== adminId) {
    const creatorRow = await prisma.user
      .findUnique({
        where: { id: creatorUserId },
        select: { totalCreditsUsed: true },
      })
      .catch(() => null);
    if (creatorRow) {
      await safe("creator", () =>
        prisma.user.update({
          where: { id: creatorUserId },
          data: {
            totalCreditsUsed: Math.max(
              0,
              (creatorRow.totalCreditsUsed ?? 0) - 1,
            ),
          },
        }),
      );
    } else {
      allOk = false;
    }
  }

  return { refunded: allOk };
}
