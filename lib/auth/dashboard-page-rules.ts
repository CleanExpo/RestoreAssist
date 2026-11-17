/**
 * RA-7721 — which roles may open the owner pages of the dashboard.
 *
 * Client-safe (no server imports) so a link list can read the same rule the
 * page layout enforces (RA-8432). The server guard,
 * `requireDashboardPageAccess`, lives in `dashboard-page-access.ts`.
 *
 * Deny by default: a role missing from a page's list, or no role at all, is
 * refused. Roles are the Prisma `Role` enum: USER (technician), MANAGER, ADMIN
 * (the business owner).
 */

export const DASHBOARD_PAGE_ACCESS = {
  "/dashboard/subscription": ["ADMIN"],
  "/dashboard/addons": ["ADMIN"],
  "/dashboard/team": ["ADMIN", "MANAGER"],
  "/dashboard/pricing-config": ["ADMIN", "MANAGER"],
  "/dashboard/integrations": ["ADMIN", "MANAGER"],
  "/dashboard/operations/completeness-inbox": ["ADMIN", "MANAGER"],
} as const satisfies Record<string, readonly string[]>;

export type GuardedDashboardPage = keyof typeof DASHBOARD_PAGE_ACCESS;

export function isGuardedDashboardPage(
  path: string,
): path is GuardedDashboardPage {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_PAGE_ACCESS, path);
}

export function canOpenDashboardPage(
  role: string | undefined,
  page: GuardedDashboardPage,
): boolean {
  if (!role) return false;
  return (DASHBOARD_PAGE_ACCESS[page] as readonly string[]).includes(role);
}
