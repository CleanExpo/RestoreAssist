/**
 * Sidebar active-state: prefix match with guards so parent sections do not
 * steal focus from create flows (e.g. Reports vs New Report).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  const target = href.replace(/\/$/, "") || "/";

  if (target === "/dashboard") {
    return path === "/dashboard";
  }

  if (!path.startsWith(target)) return false;

  if (
    target === "/dashboard/reports" &&
    path.startsWith("/dashboard/reports/new")
  ) {
    return false;
  }
  if (
    target === "/dashboard/invoices" &&
    path.startsWith("/dashboard/invoices/new")
  ) {
    return false;
  }
  if (
    target === "/dashboard/inspections" &&
    path.startsWith("/dashboard/inspections/new")
  ) {
    return false;
  }

  return true;
}
