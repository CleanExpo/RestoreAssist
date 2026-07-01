/**
 * Floor-plan underlay entitlement (PR5).
 *
 * The floor-plan underlay capability (property scrape + underlay panel) is a
 * paid feature included on the Premium tier and above. STANDARD (and orgs with
 * no tier yet) get an "Upgrade to unlock" CTA instead.
 *
 * Kept as a tiny pure predicate so the server route and the client can agree,
 * and so it's trivial to extend later (e.g. a per-org add-on entitlement).
 */
export type TierName = "STANDARD" | "PREMIUM" | "ENTERPRISE";

/** Tiers at or above Premium that include the floor-plan underlay. */
const ENTITLED_TIERS: ReadonlySet<TierName> = new Set<TierName>([
  "PREMIUM",
  "ENTERPRISE",
]);

export function hasFloorPlanUnderlay(
  tier: TierName | string | null | undefined,
): boolean {
  return tier != null && ENTITLED_TIERS.has(tier as TierName);
}
