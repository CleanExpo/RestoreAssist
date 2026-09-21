/**
 * RA-7552 — canonical client-portal entry.
 *
 * Homeowners must land on the portal, never contractor NextAuth (`/login`)
 * or contractor help (`/dashboard/help`). Tokenised job views live at
 * `/portal/<token>` (`app/portal/[token]/page.tsx`).
 *
 * Muscle-memory aliases (`/client`, `/share`, `/invite`, …) are 308'd in
 * `next.config.mjs`. `/invite/[token]` is the technician accept page and
 * is intentionally not an alias.
 */
export const CLIENT_PORTAL_ENTRY_PATH = "/portal/login" as const;
export const CLIENT_PORTAL_HOME_PATH = "/portal" as const;
export const CLIENT_PORTAL_JOB_PATH_PATTERN = "/portal/:token" as const;

/** Quiet public CTA. Prefer this over inventing a new marketing section. */
export const CLIENT_PORTAL_PUBLIC_CTA = {
  href: CLIENT_PORTAL_ENTRY_PATH,
  label: "Client portal",
  invitedLabel: "Already invited?",
} as const;

/** Bare paths that 404 today and must 308 to the account entry. */
export const CLIENT_PORTAL_ENTRY_ALIASES = [
  "/client",
  "/share",
  "/invite",
  "/client-portal",
  "/clientportal",
  "/shared",
] as const;

/**
 * Token-bearing aliases that must preserve the token so the client lands
 * on the real job view, not an orphan login bounce.
 */
export const CLIENT_PORTAL_JOB_ALIASES = [
  "/client/:token",
  "/share/:token",
  "/client-portal/:token",
  "/clientportal/:token",
  "/shared/:token",
] as const;
