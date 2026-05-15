import { prisma } from "@/lib/prisma";
import { TRIAL_DAYS, T_MINUS_BANNER_DAYS } from "@/lib/billing/constants";

export interface TrialStatus {
  isTrialActive: boolean;
  daysRemaining: number;
  trialEndsAt: Date | null;
  hasTrialExpired: boolean;
  creditsRemaining: number;
  /** True when on TRIAL and 0 < daysRemaining <= T_MINUS_BANNER_DAYS. Drives <TrialCountdownBanner>. */
  showCountdownBanner: boolean;
  /** True when trial has expired AND subscriptionStatus !== ACTIVE AND !lifetimeAccess. Drives middleware hard-paywall. */
  showHardWall: boolean;
  /** Mirror of User.lifetimeAccess so callers can render lifetime-specific UI without a second query. */
  lifetimeAccess: boolean | null;
}

/**
 * Get the trial status for a user
 */
export async function getTrialStatus(
  userId: string,
): Promise<TrialStatus | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      creditsRemaining: true,
      lifetimeAccess: true,
    },
  });

  if (!user) {
    return null;
  }

  // Not on trial
  if (user.subscriptionStatus !== "TRIAL") {
    const hasTrialExpired = false;
    return {
      isTrialActive: false,
      daysRemaining: 0,
      trialEndsAt: null,
      hasTrialExpired,
      creditsRemaining: user.creditsRemaining || 0,
      showCountdownBanner: false,
      showHardWall:
        hasTrialExpired &&
        user.subscriptionStatus !== "ACTIVE" &&
        !user.lifetimeAccess,
      lifetimeAccess: user.lifetimeAccess,
    };
  }

  const now = new Date();
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;

  if (!trialEndsAt) {
    return {
      isTrialActive: true,
      daysRemaining: TRIAL_DAYS,
      trialEndsAt: null,
      hasTrialExpired: false,
      creditsRemaining: user.creditsRemaining || 0,
      showCountdownBanner: false,
      showHardWall: false,
      lifetimeAccess: user.lifetimeAccess,
    };
  }

  const hasTrialExpired = now > trialEndsAt;
  const daysRemaining = hasTrialExpired
    ? 0
    : Math.ceil(
        (trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

  const showCountdownBanner =
    !hasTrialExpired &&
    daysRemaining > 0 &&
    daysRemaining <= T_MINUS_BANNER_DAYS;
  // In this branch subscriptionStatus === "TRIAL" (narrowed), so the
  // !== "ACTIVE" guard from the spec is implicitly satisfied here.
  const showHardWall = hasTrialExpired && !user.lifetimeAccess;

  return {
    isTrialActive: !hasTrialExpired,
    daysRemaining,
    trialEndsAt,
    hasTrialExpired,
    creditsRemaining: user.creditsRemaining || 0,
    showCountdownBanner,
    showHardWall,
    lifetimeAccess: user.lifetimeAccess,
  };
}

/**
 * Check if a trial user can perform actions
 * Returns false if trial has expired (regardless of credits remaining)
 */
export async function canTrialUserPerformAction(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const trialStatus = await getTrialStatus(userId);

  if (!trialStatus) {
    return { allowed: false, reason: "User not found" };
  }

  // Not a trial user
  if (trialStatus.trialEndsAt === null && !trialStatus.isTrialActive) {
    return { allowed: true };
  }

  // Trial has expired
  if (trialStatus.hasTrialExpired) {
    return {
      allowed: false,
      reason:
        "Your 30-day free trial has expired. Please subscribe to continue using RestoreAssist.",
    };
  }

  return { allowed: true };
}

/**
 * Handle expired trials - update subscription status
 * Call this periodically or on user access
 */
export async function handleExpiredTrials(): Promise<number> {
  const now = new Date();

  // Find all trial users whose trial has expired
  const result = await prisma.user.updateMany({
    where: {
      subscriptionStatus: "TRIAL",
      trialEndsAt: {
        lt: now,
      },
    },
    data: {
      subscriptionStatus: "EXPIRED",
      creditsRemaining: 0,
    },
  });

  return result.count;
}

/**
 * Check and update a single user's trial status if expired
 */
export async function checkAndUpdateTrialStatus(
  userId: string,
): Promise<boolean> {
  if (!userId) {
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });

  if (!user || user.subscriptionStatus !== "TRIAL") {
    return false;
  }

  const now = new Date();
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;

  if (trialEndsAt && now > trialEndsAt) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: "EXPIRED",
        creditsRemaining: 0,
      },
    });
    return true; // Trial was expired
  }

  return false; // Trial still active
}
