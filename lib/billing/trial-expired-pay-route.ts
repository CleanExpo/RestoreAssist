/**
 * RA-7462 — the single producer of `reason=trial-expired`.
 *
 * `/billing/upgrade?reason=trial-expired` already exists and already takes
 * payment. Nothing in the product used to send anyone there. The dashboard
 * stays open after a trial ends (RA-7439). The wall is this URL: the
 * dashboard banner and report-creation refusal both point at it.
 *
 * Pure module — safe for the edge `proxy` and for client components.
 */

export const TRIAL_EXPIRED_PAY_PATH = "/billing/upgrade";
export const TRIAL_EXPIRED_PAY_REASON = "trial-expired";
export const TRIAL_EXPIRED_PAY_ROUTE = `${TRIAL_EXPIRED_PAY_PATH}?reason=${TRIAL_EXPIRED_PAY_REASON}`;

export const TRIAL_EXPIRED_REFUSAL_CODE = "TRIAL_EXPIRED" as const;

export const TRIAL_EXPIRED_REFUSAL_REASON =
  "Your 15-day free trial has expired. Please subscribe to continue using RestoreAssist.";

/** Existing credits / monthly-limit wall. Unchanged for in-period trials. */
export const REPORT_CREATION_CREDITS_ROUTE = "/dashboard/pricing";

export type TrialExpiredRefusal = {
  allowed: false;
  reason: string;
  code: typeof TRIAL_EXPIRED_REFUSAL_CODE;
  payRoute: typeof TRIAL_EXPIRED_PAY_ROUTE;
};

export function trialExpiredRefusal(): TrialExpiredRefusal {
  return {
    allowed: false,
    reason: TRIAL_EXPIRED_REFUSAL_REASON,
    code: TRIAL_EXPIRED_REFUSAL_CODE,
    payRoute: TRIAL_EXPIRED_PAY_ROUTE,
  };
}

export function isExpiredTrialStatus(
  subscriptionStatus: string | null | undefined,
): boolean {
  return subscriptionStatus === "EXPIRED";
}

/**
 * True for a trial that has ended, including after `checkAndUpdateTrialStatus`
 * flips the row from TRIAL to EXPIRED.
 */
export function isExpiredTrialWindow(
  subscriptionStatus: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (isExpiredTrialStatus(subscriptionStatus)) return true;
  if (subscriptionStatus !== "TRIAL" || trialEndsAt == null) return false;
  const ends =
    trialEndsAt instanceof Date
      ? trialEndsAt.getTime()
      : Date.parse(String(trialEndsAt));
  if (Number.isNaN(ends)) return false;
  return now > ends;
}

/**
 * RA-7439 / RA-7462 — dashboard lockout.
 *
 * Expired trial (TRIAL past trialEndsAt, or EXPIRED after the sweep) keeps
 * the dashboard. Cancelled and past-due paid accounts still lock out.
 * Lifetime and ACTIVE never lock. Missing status fails open (legacy JWT).
 */
export function shouldLockDashboardForSubscription(token: {
  subscriptionStatus?: string | null;
  trialEndsAt?: string | Date | null;
  lifetimeAccess?: boolean | null;
}): boolean {
  if (token.lifetimeAccess === true) return false;
  const status = token.subscriptionStatus;
  if (status == null) return false;
  if (status === "ACTIVE" || status === "TRIAL" || status === "EXPIRED") {
    return false;
  }
  return true;
}

export function resolveReportCreationPayRoute(result: {
  payRoute?: string | null;
  code?: string | null;
}): string {
  if (result.payRoute) return result.payRoute;
  if (result.code === TRIAL_EXPIRED_REFUSAL_CODE) return TRIAL_EXPIRED_PAY_ROUTE;
  return REPORT_CREATION_CREDITS_ROUTE;
}

export function isTrialExpiredPayRoute(href: string): boolean {
  return (
    href === TRIAL_EXPIRED_PAY_ROUTE ||
    href.startsWith(`${TRIAL_EXPIRED_PAY_PATH}?reason=${TRIAL_EXPIRED_PAY_REASON}`)
  );
}
