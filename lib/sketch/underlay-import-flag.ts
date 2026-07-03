/**
 * RA-6848 [C2] — legal kill-switch for the URL floor-plan import path.
 *
 * This is the release control for RA-6850 [C4]: AU IP counsel must sign off
 * before URL import is exposed to users. It is deliberately INDEPENDENT of the
 * RA-6922 billing entitlement (`hasFloorPlanUnderlay`) — billing decides *who*
 * pays for the feature; this flag decides whether it is legally cleared to run
 * at all. Both must be open before URL import reaches a user.
 *
 * Defaults OFF. Only an explicit truthy env value opens it. Client-readable, so
 * it is a `NEXT_PUBLIC_` variable (inlined at build time). The upload path
 * (C3) is not gated here — only the URL scrape path, which is the one counsel
 * flagged for source-ToS/scraping risk.
 */
export function isUnderlayUrlImportEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT,
): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}
