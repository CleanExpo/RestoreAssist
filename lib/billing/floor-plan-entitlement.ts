/**
 * Floor-plan underlay entitlement.
 *
 * F2 (RA-6929/6930/6931): the retired STANDARD/PREMIUM/ENTERPRISE tier catalog
 * was the ONLY source that could grant this entitlement, and no code path ever
 * wrote `subscriptionTierId`, so the feature was already unreachable for every
 * user. With the tier catalog retired, there is NO entitlement source until the
 * RA-6922 add-on layer ships. This predicate therefore returns `false` for
 * every input — the server keeps its fail-closed 402 and the client CTA is
 * hidden — so we never sell a plan (a "Premium" tier) that does not exist.
 *
 * The `tier` argument is retained for call-site compatibility but is now
 * deprecated and ignored; re-enable real entitlement resolution under RA-6922.
 */
export type TierName = "STANDARD" | "PREMIUM" | "ENTERPRISE";

export function hasFloorPlanUnderlay(
  _tier?: TierName | string | null | undefined,
): boolean {
  // No entitlement source until RA-6922 — always false (F2).
  return false;
}
