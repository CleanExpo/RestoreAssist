/**
 * NZ NHCover claim-pathway rules (Natural Hazards Insurance Act 2023).
 *
 * Source — Natural Hazards Commission Toka Tū Ake (confirmed 2026-06-09):
 *  - https://www.naturalhazards.govt.nz/insurance-and-claims/about-nhcover/
 *  - https://www.naturalhazards.govt.nz/about-nhc/how-we-work/natural-hazards-insurance-act-2023/
 *
 * Confirmed rules:
 *  - Residential building cover cap: NZ$300,000 + GST per home (since 1 Oct 2022,
 *    carried into the NHI Act 2023). Cover above the cap is the private insurer's.
 *  - Flat excess under the NHI Act 2023: $500 per insured home (building and land);
 *    capped at $5,000 for buildings with more than 10 insured homes.
 *  - Building damage covered: earthquake, landslip (landslide), volcanic activity,
 *    hydrothermal activity, tsunami, and fire caused by any of these.
 *  - Storm / flood: LAND cover only — building storm/flood is the PRIVATE insurer.
 *
 * PHILL CHECK (confirm before relying on payouts): the $500 flat excess and the
 * $300k+GST cap are org-overridable constants below; verify against the current
 * NHC schedule / the client's policy, as excess detail can vary.
 */

export type DamageCause =
  | "earthquake"
  | "landslip"
  | "volcanic"
  | "hydrothermal"
  | "tsunami"
  | "fire_natural" // fire caused by a covered natural hazard
  | "storm"
  | "flood"
  | "other";

export type DamageTarget = "building" | "land";

export type Pathway = "nz_nhcover" | "nz_private";

export interface CoverResult {
  pathway: Pathway;
  covered: boolean;
  reason: string;
}

/** NZ$ building cover cap (plus GST). */
export const NHC_BUILDING_CAP_NZD = 300_000;
/** Flat excess per insured home (NHI Act 2023). */
export const NHC_FLAT_EXCESS_NZD = 500;
/** Excess cap for buildings with more than 10 insured homes. */
export const NHC_MAX_EXCESS_NZD = 5_000;
const MULTI_HOME_THRESHOLD = 10;

/** Causes whose BUILDING damage is covered by NHCover. */
const BUILDING_COVERED = new Set<DamageCause>([
  "earthquake",
  "landslip",
  "volcanic",
  "hydrothermal",
  "tsunami",
  "fire_natural",
]);

/** Causes covered for LAND only (building goes to the private insurer). */
const LAND_ONLY = new Set<DamageCause>(["storm", "flood"]);

export function classifyCover(
  cause: DamageCause,
  target: DamageTarget,
): CoverResult {
  if (target === "land") {
    if (BUILDING_COVERED.has(cause) || LAND_ONLY.has(cause)) {
      return {
        pathway: "nz_nhcover",
        covered: true,
        reason: `Land damage from ${cause} sits with NHCover (land cover).`,
      };
    }
    return {
      pathway: "nz_private",
      covered: false,
      reason: `Land damage from ${cause} is not an NHCover natural hazard.`,
    };
  }

  // building
  if (BUILDING_COVERED.has(cause)) {
    return {
      pathway: "nz_nhcover",
      covered: true,
      reason: `Building damage from ${cause} is covered by NHCover up to the cap; the private insurer tops up to sum insured.`,
    };
  }
  if (LAND_ONLY.has(cause)) {
    return {
      pathway: "nz_private",
      covered: false,
      reason: `Storm/flood damage to buildings is NOT NHCover — the private insurer covers the building (only land sits with NHCover).`,
    };
  }
  return {
    pathway: "nz_private",
    covered: false,
    reason: `${cause} is not a natural hazard — private insurer.`,
  };
}

export interface BuildingClaimCalc {
  pathway: Pathway;
  /** Amount NHCover meets, up to the cap. */
  nhcCoveredAmount: number;
  excess: number;
  /** Amount above the cap routed to the private insurer. */
  privateTopUp: number;
  cappedAtNhcLimit: boolean;
}

export function buildingClaim(
  cause: DamageCause,
  estimatedRepairNzd: number,
  opts: { insuredHomes?: number } = {},
): BuildingClaimCalc {
  const cover = classifyCover(cause, "building");
  if (!cover.covered) {
    return {
      pathway: "nz_private",
      nhcCoveredAmount: 0,
      excess: 0,
      privateTopUp: estimatedRepairNzd,
      cappedAtNhcLimit: false,
    };
  }

  const homes = opts.insuredHomes ?? 1;
  const excess =
    homes > MULTI_HOME_THRESHOLD ? NHC_MAX_EXCESS_NZD : NHC_FLAT_EXCESS_NZD;
  const nhcCoveredAmount = Math.min(estimatedRepairNzd, NHC_BUILDING_CAP_NZD);
  const privateTopUp = Math.max(0, estimatedRepairNzd - NHC_BUILDING_CAP_NZD);

  return {
    pathway: "nz_nhcover",
    nhcCoveredAmount,
    excess,
    privateTopUp,
    cappedAtNhcLimit: estimatedRepairNzd > NHC_BUILDING_CAP_NZD,
  };
}
