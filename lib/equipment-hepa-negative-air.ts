/**
 * RA-873: HEPA vacuum + Negative Air Machine sizing calculator.
 *
 * Mould + biohazard remediation require containment with controlled negative
 * pressure plus HEPA particulate capture. This module sizes:
 *   - Negative-Air Machines (NAMs) from room volume × target ACH
 *   - HEPA vacuums from estimated surface area (assumes ~2.4 m ceilings)
 *
 * References: IICRC S520:2024 §12.2 (mould containment), AIHA Z9.11,
 * US EPA 402-K-01-001 (mould remediation) for ACH targets.
 */

export type ContainmentClass =
  | "critical-barrier"
  | "negative-pressure"
  | "secondary-containment";

export interface HepaNegativeAirInput {
  /** Room volume in cubic metres. */
  roomVolumeM3: number;
  /** Containment classification — drives default ACH. */
  containmentClass: ContainmentClass;
  /** Optional ACH override; when omitted uses containment class default. */
  ach?: number;
}

export interface HepaNegativeAirResult {
  /** Number of HEPA vacuums required. */
  hepaVacuumCount: number;
  /** Number of portable negative-air machines required. */
  negativeAirMachineCount: number;
  /** ACH target actually applied (override or class default). */
  airChangesPerHour: number;
}

/** Default ACH per containment class. */
const DEFAULT_ACH: Record<ContainmentClass, number> = {
  "critical-barrier": 4,
  "negative-pressure": 6,
  "secondary-containment": 8,
};

/** CFM output of a typical portable negative-air machine. */
const NAM_CFM_PER_UNIT = 500;
/** m³ → ft³ conversion. */
const M3_TO_FT3 = 35.3147;
/** Minutes per hour — for CFM conversion. */
const MINUTES_PER_HOUR = 60;
/** Average ceiling height assumption for surface-area estimate. */
const AVG_CEILING_HEIGHT_M = 2.4;
/** 1 HEPA vacuum per 25 m² of surface area. */
const HEPA_VAC_AREA_PER_UNIT = 25;

/**
 * Size HEPA vacuums + negative-air machines for a containment zone.
 *
 * NAM CFM needed = roomVolumeM3 × 35.3147 × ACH / 60
 * HEPA vacuum surface area ≈ (roomVolumeM3 / 2.4) × 2
 */
export function calculateHepaNegativeAir(
  params: HepaNegativeAirInput,
): HepaNegativeAirResult {
  const { containmentClass } = params;
  const volumeM3 = Math.max(0, params.roomVolumeM3);
  const ach = params.ach ?? DEFAULT_ACH[containmentClass];

  // NAM sizing from airflow demand.
  const cfmNeeded = (volumeM3 * M3_TO_FT3 * ach) / MINUTES_PER_HOUR;
  const negativeAirMachineCount =
    cfmNeeded > 0 ? Math.ceil(cfmNeeded / NAM_CFM_PER_UNIT) : 0;

  // HEPA vacuum sizing from surface-area estimate.
  // Floor area ≈ volume / avg ceiling height; surface area ≈ 2 × floor area
  // (floor + walls/ceiling fold-in approximation).
  const floorAreaM2 = volumeM3 / AVG_CEILING_HEIGHT_M;
  const surfaceAreaM2 = floorAreaM2 * 2;
  const hepaVacuumCount =
    surfaceAreaM2 > 0 ? Math.ceil(surfaceAreaM2 / HEPA_VAC_AREA_PER_UNIT) : 0;

  return {
    hepaVacuumCount,
    negativeAirMachineCount,
    airChangesPerHour: ach,
  };
}
