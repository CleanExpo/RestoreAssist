/**
 * Canonical public app URL for links embedded in outbound email.
 *
 * Falls back to the PRODUCTION origin — never localhost — so a missing
 * NEXT_PUBLIC_APP_URL in a deployed environment cannot leak
 * http://localhost:3000 links into customer emails (2026-07-03 SHIPIT
 * audit, email-layer defect d).
 */
const PRODUCTION_APP_URL = "https://restoreassist.app";

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return PRODUCTION_APP_URL;
  // Strip trailing slashes so callers can safely append paths.
  return configured.replace(/\/+$/, "") || PRODUCTION_APP_URL;
}
