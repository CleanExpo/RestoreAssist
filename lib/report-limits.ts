import { prisma } from "@/lib/prisma";
import {
  getEffectiveSubscription,
  getOrganizationOwner,
} from "@/lib/organization-credits";
import { checkAndUpdateTrialStatus } from "@/lib/trial-handling";

/**
 * F3 (RA-6929/6930/6931) — stable, self-contained base report limits keyed on
 * the free-text `subscriptionPlan` string stored on the user row.
 *
 * This map is DELIBERATELY decoupled from `PRICING_CONFIG`. The billing-catalog
 * collapse retired the Yearly SKU from `PRICING_CONFIG.pricing`, but existing
 * ACTIVE subscribers are grandfathered (clarification C4) and still carry
 * `subscriptionPlan = "Yearly Plan"` / `"Lifetime"`. If the resolver read the
 * catalog, those users would silently drop to 50 the moment `pricing.yearly`
 * was deleted. Resolving from this stable map preserves 70/999 forever;
 * unknown/null plans fall back to the base 50 (never a lower silent value).
 */
export const PLAN_REPORT_LIMITS: Record<string, number> = {
  Lifetime: 999,
  "Yearly Plan": 70,
  "Monthly Plan": 50,
};

/** Base monthly report limit for any plan not in {@link PLAN_REPORT_LIMITS}. */
export const DEFAULT_REPORT_LIMIT = 50;

/**
 * Resolve the base monthly report limit for a stored `subscriptionPlan` string.
 * Grandfathered legacy plans keep their historical limit; anything unknown or
 * null resolves to the base 50 — never a silent drop below it.
 */
export function resolveBaseReportLimit(
  subscriptionPlan: string | null | undefined,
): number {
  if (!subscriptionPlan) return DEFAULT_REPORT_LIMIT;
  return PLAN_REPORT_LIMITS[subscriptionPlan] ?? DEFAULT_REPORT_LIMIT;
}

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
    // F3 — resolve the base limit from the stable PLAN_REPORT_LIMITS map so
    // grandfathered "Yearly Plan" (70) and "Lifetime" (999) users survive the
    // catalog collapse instead of silently dropping to 50.
    const baseLimit = resolveBaseReportLimit(user.subscriptionPlan);

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
      subscriptionPlan: true,
      addonReports: true,
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
    // RA-6968 — the paid monthly cap is enforced ATOMICALLY here, not by the
    // caller's earlier canCreateReport() check. That check-then-increment split
    // is a TOCTOU: two concurrent creates both read availableReports > 0 and
    // both increment, pushing a paid account past its monthly limit.
    //
    // Resolve the cap (base plan + purchased add-on packs) the same way
    // getUserReportLimits does, so the check and the write never disagree.
    const baseLimit = resolveBaseReportLimit(admin.subscriptionPlan);
    let addonFromPurchases = 0;
    try {
      const purchases = await prisma.addonPurchase.findMany({
        where: { userId: adminId, status: "COMPLETED" },
        select: { reportLimit: true },
      });
      addonFromPurchases = purchases.reduce((sum, p) => sum + p.reportLimit, 0);
    } catch {
      // AddonPurchase model may not exist in every deployment — fall back to
      // the denormalised addonReports field, matching getUserReportLimits.
    }
    const addonReports = Math.max(addonFromPurchases, admin.addonReports ?? 0);
    const totalLimit = baseLimit + addonReports;

    // RA-1313 — race-safe monthly rollover. Two team members creating on the
    // 1st must not both observe shouldReset=true and clobber each other's
    // increment. A fresh period's first report is always under the cap, so the
    // reset writes monthlyReportsUsed = 1 unconditionally.
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
      // No rollover this call — atomically increment ONLY while strictly under
      // the cap (rule 6, never read-then-write). count === 0 means the limit is
      // already reached: block by throwing the shared INSUFFICIENT_CREDITS
      // sentinel every caller already maps to HTTP 402.
      const incResult = await prisma.user.updateMany({
        where: { id: adminId, monthlyReportsUsed: { lt: totalLimit } },
        data: { monthlyReportsUsed: { increment: 1 } },
      });
      if (incResult.count === 0) {
        throw new Error("INSUFFICIENT_CREDITS");
      }
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
 *  - Idempotent-friendly: every leg is a guarded atomic decrement
 *    (updateMany where counter gte 1). The DB-side guard — not a JS clamp —
 *    means a stray double-refund (or a refund of a charge that hit the trial
 *    floor) is a clean no-op: it can't drive a counter negative nor inflate
 *    creditsRemaining above a sane state.
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

  // Only the subscription status is read here — the counter values are never
  // read-then-written; each leg below decrements atomically with a WHERE guard.
  const admin = await prisma.user
    .findUnique({
      where: { id: adminId },
      select: { subscriptionStatus: true },
    })
    .catch(() => null);

  if (!admin) {
    console.error(
      `[refundCreditsAndTrackUsage] admin ${adminId} not found; cannot refund charge for creator ${creatorUserId}`,
    );
    return { refunded: false };
  }

  // --- Invert the admin-side charge ------------------------------------------
  // Guarded atomic decrement (rule 6) — the `gte: 1` WHERE guard replaces the
  // old JS clamp AND makes the refund race-safe: a concurrent create's atomic
  // increment can no longer be clobbered by an absolute write, and a refund
  // racing the monthly rollover can't stamp a stale prior-month value over the
  // freshly-reset counter.
  if (admin.subscriptionStatus === "TRIAL") {
    // Inverse of the trial charge: creditsRemaining +1, totalCreditsUsed -1.
    // Both live in one guarded write so a stray double-refund (totalCreditsUsed
    // already at the 0 floor) is a clean no-op — it can neither drive
    // totalCreditsUsed negative nor inflate creditsRemaining above a sane state.
    await safe("trial-admin", () =>
      prisma.user.updateMany({
        where: { id: adminId, totalCreditsUsed: { gte: 1 } },
        data: {
          creditsRemaining: { increment: 1 },
          totalCreditsUsed: { decrement: 1 },
        },
      }),
    );
  } else if (admin.subscriptionStatus === "ACTIVE") {
    // Inverse of the monthly-usage increment — worth exactly one slot. The
    // `gte: 1` guard never decrements a freshly-reset 0 into the negatives.
    await safe("active-admin", () =>
      prisma.user.updateMany({
        where: { id: adminId, monthlyReportsUsed: { gte: 1 } },
        data: { monthlyReportsUsed: { decrement: 1 } },
      }),
    );
  }

  // --- Invert the manager-side usage tracking --------------------------------
  if (creator && creator.role === "USER" && creator.managedById) {
    const managerId = creator.managedById;
    await safe("manager", () =>
      prisma.user.updateMany({
        where: { id: managerId, totalCreditsUsed: { gte: 1 } },
        data: { totalCreditsUsed: { decrement: 1 } },
      }),
    );
  }

  // --- Invert the creator-side usage tracking (only if creator != admin) -----
  if (creatorUserId !== adminId) {
    await safe("creator", () =>
      prisma.user.updateMany({
        where: { id: creatorUserId, totalCreditsUsed: { gte: 1 } },
        data: { totalCreditsUsed: { decrement: 1 } },
      }),
    );
  }

  return { refunded: allOk };
}
