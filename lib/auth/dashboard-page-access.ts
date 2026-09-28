/**
 * RA-7721 — which roles may open the owner pages of the dashboard.
 *
 * The sidebar already hides these pages from technicians (role USER) and hides
 * Subscription and Add-ons from managers (DashboardShell.tsx), but hiding a
 * link does not stop someone typing the address. Each page's layout calls
 * `requireDashboardPageAccess` so the rule is enforced on the server.
 *
 * Deny by default: a role missing from a page's list, or no role at all, is
 * refused. Roles are the Prisma `Role` enum: USER (technician), MANAGER, ADMIN
 * (the business owner).
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export const DASHBOARD_PAGE_ACCESS = {
  "/dashboard/subscription": ["ADMIN"],
  "/dashboard/addons": ["ADMIN"],
  "/dashboard/team": ["ADMIN", "MANAGER"],
  "/dashboard/pricing-config": ["ADMIN", "MANAGER"],
  "/dashboard/integrations": ["ADMIN", "MANAGER"],
} as const satisfies Record<string, readonly string[]>;

export type GuardedDashboardPage = keyof typeof DASHBOARD_PAGE_ACCESS;

export function canOpenDashboardPage(
  role: string | undefined,
  page: GuardedDashboardPage,
): boolean {
  if (!role) return false;
  return (DASHBOARD_PAGE_ACCESS[page] as readonly string[]).includes(role);
}

/** Server-side guard for a page layout. Redirects when the role is refused. */
export async function requireDashboardPageAccess(
  page: GuardedDashboardPage,
): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const role = (session.user as { role?: string }).role;
  if (canOpenDashboardPage(role, page)) return;

  redirect(role === "USER" ? "/dashboard/field" : "/dashboard");
}
