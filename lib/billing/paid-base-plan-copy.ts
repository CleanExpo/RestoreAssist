/**
 * Client-safe paid-plan copy and pure helpers.
 *
 * Split from paid-base-plan.ts so dashboard client components can share the
 * upgrade href and message without dragging organization-credits → prisma → pg
 * into the browser bundle. pg needs Node builtins (dns, fs, net, tls,
 * util/types) that Turbopack cannot resolve for Client Component Browser.
 *
 * Do NOT import server-only modules here.
 */

export const PAID_BASE_PLAN_MESSAGE =
  "This feature is included with the paid RestoreAssist plan. Upgrade from trial to unlock Enhanced and Optimised reports and PDF import.";

export const PAID_BASE_PLAN_UPGRADE_HREF =
  "/billing/upgrade?reason=feature&feature=paid-plan";

export function isPaidReportDepth(level: string | null | undefined): boolean {
  const normalised = (level ?? "").trim().toLowerCase();
  return (
    normalised === "enhanced" ||
    normalised === "optimised" ||
    normalised === "optimized"
  );
}
