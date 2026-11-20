/**
 * Theme scope for the whole app (RA-8305; light by default from 19/11/2026).
 *
 * Every route honours the Appearance setting: Light, Dark or System, stored
 * by next-themes under the "theme" key. Anyone who has never chosen gets
 * Light. Phill chose light-first with palette A ("Harbour blue and signal
 * orange") on 19/11/2026, after the design audit of 18/11/2026 (section 6).
 *
 * Public pages (marketing, login, onboarding, portal) used to be forced dark.
 * They now follow the same stored choice. A surface that cannot yet render in
 * light keeps its own dark island; see tests/unit/light-mode-surfaces.test.ts.
 */

export const THEMED_ROUTE_PREFIX = "/dashboard";

/**
 * True for the signed-in workspace. Kept because callers use it to decide
 * where the Appearance setting is offered; it no longer decides whether a
 * route is forced dark.
 */
export function isUserThemedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === THEMED_ROUTE_PREFIX ||
    pathname.startsWith(`${THEMED_ROUTE_PREFIX}/`)
  );
}

export interface AppThemeProviderProps {
  attribute: "class";
  defaultTheme: "light";
  enableSystem: true;
  disableTransitionOnChange: true;
}

export function appThemeProviderProps(
  _pathname?: string | null,
): AppThemeProviderProps {
  return {
    attribute: "class",
    defaultTheme: "light",
    enableSystem: true,
    disableTransitionOnChange: true,
  };
}
