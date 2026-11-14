/**
 * Theme scope for the whole app (RA-8305).
 *
 * The signed-in workspace (/dashboard and everything under it) honours the
 * Appearance setting: Light, Dark or System, stored by next-themes under the
 * "theme" key. Anyone who has never chosen gets Dark, as before.
 *
 * Public pages (marketing, login, onboarding, portal) are designed dark-only,
 * so they stay forced dark whatever is stored. Moving a route into the themed
 * set means its surfaces must carry light pairs first — see
 * tests/unit/light-mode-surfaces.test.ts.
 */

export const THEMED_ROUTE_PREFIX = "/dashboard";

export function isUserThemedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === THEMED_ROUTE_PREFIX ||
    pathname.startsWith(`${THEMED_ROUTE_PREFIX}/`)
  );
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
