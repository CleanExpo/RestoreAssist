/**
 * Theme scope for the whole app (RA-8305).
 *
 * The signed-in workspace (/dashboard and everything under it) honours the
 * Appearance setting: Light, Dark or System, stored by next-themes under the
 * "theme" key. Anyone who has never chosen gets Dark, as before.
 *
 * Public pages (marketing, login, onboarding, portal) are designed dark-only,
 * so they stay forced dark whatever is stored.
 *
 * Dashboard routes whose page.tsx is on LIGHT_PENDING_FILES (RA-8383) also
 * stay forced dark until that page carries light pairs. The guard in
 * tests/unit/light-mode-surfaces.test.ts keeps that list honest.
 */

import { LIGHT_PENDING_FILES } from "./light-pending";

export const THEMED_ROUTE_PREFIX = "/dashboard";

/**
 * Turn an App Router page file (`app/dashboard/clients/[id]/page.tsx`) into
 * a pattern for the URLs it serves. A dynamic segment matches any value, so
 * a pending `[id]` page also keeps static siblings such as `new` dark. That
 * errs towards Dark, which is the safe, unchanged default.
 */
export function routePatternForPageFile(file: string): RegExp {
  const segments = file
    .replace(/^app\//, "")
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter((seg) => !/^\(.*\)$/.test(seg));
  let pattern = "";
  for (const seg of segments) {
    if (/^\[\[\.\.\..+\]\]$/.test(seg)) pattern += "(?:/.*)?";
    else if (/^\[\.\.\..+\]$/.test(seg)) pattern += "/.+";
    else if (/^\[.+\]$/.test(seg)) pattern += "/[^/]+";
    else pattern += `/${seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }
  return new RegExp(`^${pattern}/?$`);
}

const LIGHT_PENDING_ROUTES: readonly RegExp[] = LIGHT_PENDING_FILES.filter(
  (file) => file.endsWith("/page.tsx"),
).map(routePatternForPageFile);

export function isUserThemedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const inDashboard =
    pathname === THEMED_ROUTE_PREFIX ||
    pathname.startsWith(`${THEMED_ROUTE_PREFIX}/`);
  if (!inDashboard) return false;
  return !LIGHT_PENDING_ROUTES.some((route) => route.test(pathname));
}

export interface AppThemeProviderProps {
  attribute: "class";
  defaultTheme: "dark";
  enableSystem: true;
  disableTransitionOnChange: true;
  forcedTheme?: "dark";
}

export function appThemeProviderProps(
  pathname: string | null | undefined,
): AppThemeProviderProps {
  const base: AppThemeProviderProps = {
    attribute: "class",
    defaultTheme: "dark",
    enableSystem: true,
    disableTransitionOnChange: true,
  };
  return isUserThemedPath(pathname) ? base : { ...base, forcedTheme: "dark" };
}
