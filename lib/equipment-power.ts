/**
 * Equipment electrical-load and running-cost model (Australia, 230 V / 50 Hz).
 *
 * - Circuit maths follows the AS/NZS 3012:2019 80% continuous-load rule:
 *   drying equipment runs 24/7, so a circuit must not carry more than 80% of
 *   its rated current continuously.
 * - Australian domestic GPOs (general purpose outlets) are 10 A as standard
 *   (AS/NZS 3112 plugs); 15 A and 20 A outlets exist on dedicated circuits.
 *   Circuit counts are therefore reported for 10 A first, with 15 A / 20 A
 *   as options.
 * - Energy = rated watts x 24 h (restoration drying equipment runs
 *   continuously between site visits).
 * - Default electricity tariff is a sourced national average, overridable per
 *   call (e.g. from an org's own supply contract).
 */

import {
  type EquipmentSelection,
  getEquipmentGroupById,
} from "@/lib/equipment-matrix";

/**
 * Default residential electricity tariff, cents per kWh (AUD).
 *
 * Source: Canstar "Electricity Costs per kWh" rate tables (canstar.com.au,
 * plan data as at May 2026) publish average single-rate usage rates by
 * network: SA 43.7, NSW 36.2-40.4, SEQ 33.3, ACT 30.8, TAS 28.0,
 * VIC 26.0-33.0 c/kWh (overall retailer range 24-45 c/kWh). 34 c/kWh is the
 * population-weighted average of those published network rates and is used as
 * the defensible national default. Override with the client's actual tariff
 * whenever it is known.
 */
export const DEFAULT_ELECTRICITY_TARIFF_C_PER_KWH = 34;

/** AS/NZS 3012:2019 — continuous loads limited to 80% of circuit rating. */
export const CONTINUOUS_LOAD_FACTOR = 0.8;

/** Standard Australian outlet/circuit ratings (amps). 10 A is the domestic GPO. */
export const AU_CIRCUIT_RATINGS_A = [10, 15, 20] as const;
export type AuCircuitRatingA = (typeof AU_CIRCUIT_RATINGS_A)[number];

export interface CircuitRequirement {
  /** Circuit rating in amps (10 A = standard AU domestic GPO). */
  ratingA: AuCircuitRatingA;
  /** Maximum continuous load per circuit under AS/NZS 3012:2019 (80%). */
  maxContinuousA: number;
  /** Minimum number of separate circuits of this rating required. */
  circuitsRequired: number;
}

/**
 * Circuit counts for a continuous load, per AS/NZS 3012:2019 (80% rule),
 * for each standard Australian circuit rating.
 */
export function calculateCircuitRequirements(
  totalAmps: number,
): CircuitRequirement[] {
  const amps = Math.max(0, totalAmps);
  return AU_CIRCUIT_RATINGS_A.map((ratingA) => {
    const maxContinuousA = ratingA * CONTINUOUS_LOAD_FACTOR;
    return {
      ratingA,
      maxContinuousA,
      circuitsRequired: amps === 0 ? 0 : Math.ceil(amps / maxContinuousA),
    };
  });
}

/** Total rated power (watts) across selected equipment groups. */
export function calculateTotalWatts(selections: EquipmentSelection[]): number {
  return selections.reduce((total, selection) => {
    const group = getEquipmentGroupById(selection.groupId);
    if (group?.watts) {
      return total + group.watts * selection.quantity;
    }
    return total;
  }, 0);
}

/** Energy for 24 h continuous operation, in kWh/day. */
export function wattsToKwhPerDay(watts: number): number {
  return (Math.max(0, watts) * 24) / 1000;
}

/** Total energy across selected equipment, kWh/day (24 h continuous). */
export function calculateTotalKwhPerDay(
  selections: EquipmentSelection[],
): number {
  return wattsToKwhPerDay(calculateTotalWatts(selections));
}

/**
 * Electricity running cost per day (AUD) for the selected equipment.
 * Tariff is cents/kWh; defaults to the sourced national average.
 */
export function calculateElectricityCostPerDay(
  selections: EquipmentSelection[],
  tariffCentsPerKwh: number = DEFAULT_ELECTRICITY_TARIFF_C_PER_KWH,
): number {
  const kwhPerDay = calculateTotalKwhPerDay(selections);
  return (kwhPerDay * Math.max(0, tariffCentsPerKwh)) / 100;
}
