/**
 * IICRC S500 Equipment Calculator
 * Converts room dimensions + damage classification → defensible equipment list.
 *
 * Quantities use industry-standard area ratios consistent with IICRC S500:2021
 * drying practice, rounded UP (ceiling). Ratio subsection numbers are NOT cited
 * because they are not present in the verified section corpus
 * (lib/standards/s500-sections.ts) — citations degrade to the nearest
 * corpus-verified section instead of fabricating subsection numbers:
 *   - Dehumidification sizing  → S500:2021 §12.4.2 (Controlling Humidity and Stabilization)
 *   - Airflow / drying         → S500:2021 §12.5 (Drying)
 *   - AFD / negative air       → S500:2021 §12.3.2 (Engineering Controls)
 *   - Category / Class         → S500:2021 §10.4 (Definitions of Category and Class)
 *
 * Electrical data comes from lib/equipment-matrix.ts (sourced 230 V specs).
 * Electrical load validation per AS/NZS 3012:2019 80% continuous-load rule,
 * reported against standard Australian 10 A GPO circuits (15 A / 20 A options
 * included via lib/equipment-power.ts).
 */

import {
  getEquipmentGroupById,
  type EquipmentGroup,
} from "@/lib/equipment-matrix";
import {
  calculateCircuitRequirements,
  DEFAULT_ELECTRICITY_TARIFF_C_PER_KWH,
  wattsToKwhPerDay,
  type CircuitRequirement,
} from "@/lib/equipment-power";

// ============================================================
// Types
// ============================================================

export type DamageCategory = "CAT_1" | "CAT_2" | "CAT_3";
export type DamageClass = "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4";

export interface EquipmentLineItem {
  type: EquipmentType;
  label: string;
  quantity: number;
  iicrcRatio: string; // e.g. "1 per 15m²"
  iicrcReference: string; // e.g. "IICRC S500:2021 §12.4.2"
  justification: string; // e.g. "23.5m² ÷ 15m² = 2 air movers required"
  suggestedModel: string; // from equipment-matrix.ts (sourced 230V models)
  estimatedAmpsEach: number; // amp draw per unit @ 230V (equipment-matrix)
  estimatedAmpsTotal: number;
  estimatedWattsEach: number; // rated power per unit, W (equipment-matrix)
  estimatedWattsTotal: number;
  kwhPerDayTotal: number; // 24 h continuous operation
}

export type EquipmentType =
  | "air_mover"
  | "lgr_dehumidifier"
  | "desiccant_dehumidifier"
  | "air_scrubber"
  | "negative_air_machine"
  | "hepa_vacuum";

export interface EquipmentCalculatorInput {
  affectedAreaM2: number;
  damageClass: DamageClass;
  damageCategory: DamageCategory;
  /** Number of affected floors — multiplied into equipment count (default 1) */
  floorCount?: number;
  /**
   * Ambient temperature at the site, Celsius. Below 15°C, LGR (refrigerant)
   * extraction efficiency collapses and desiccant dehumidification is
   * substituted (adsorption units are rated to -15°C — see equipment-matrix).
   */
  ambientTempC?: number;
  /** Electricity tariff, cents/kWh. Defaults to the sourced national average. */
  tariffCentsPerKwh?: number;
}

export interface EquipmentCalculatorResult {
  equipmentList: EquipmentLineItem[];
  totalEstimatedAmps: number;
  totalEstimatedWatts: number;
  /** Total energy for 24 h continuous operation, kWh/day. */
  totalKwhPerDay: number;
  /** Electricity running cost per day, AUD, at the applied tariff. */
  energyCostPerDay: number;
  /** Tariff applied (cents/kWh). */
  tariffCentsPerKwh: number;
  /** AS/NZS 3012:2019: total load must not exceed 80% of circuit rating */
  circuitLoadWarning?: string;
  /**
   * Recommended minimum number of standard Australian 10 A GPO circuits
   * (AS/NZS 3012:2019 80% rule → 8 A continuous per 10 A circuit).
   */
  recommendedCircuits: number;
  /** Circuit counts for each standard AU rating (10 A GPO / 15 A / 20 A). */
  circuitOptions: CircuitRequirement[];
  summary: string;
  iicrcClassification: string;
}

// ============================================================
// IICRC S500-consistent sizing ratios (m² per unit)
// The exact ratio subsections are not in the verified corpus, so references
// degrade to the nearest corpus-verified section (see file header).
// ============================================================

// Air mover ratios (m² per unit) — S500:2021 §12.5 (Drying)
// Exported so other equipment-sizing surfaces (e.g. components/EquipmentSizingGuidelines.tsx,
// components/DryingPlanTemplates.tsx) delegate to these figures instead of maintaining
// their own divergent (and previously imperial sq-ft-based) copies.
export const AIR_MOVER_RATIO: Record<DamageClass, number> = {
  CLASS_1: 15, // 1 per 15m²
  CLASS_2: 15, // 1 per 15m²
  CLASS_3: 10, // 1 per 10m² (aggressive drying)
  CLASS_4: 10, // 1 per 10m² (specialty drying)
};

// Dehumidifier ratios (m² per unit) — S500:2021 §12.4.2 (Controlling Humidity
// and Stabilization)
export const DEHU_RATIO: Record<DamageClass, number> = {
  CLASS_1: 40,
  CLASS_2: 40,
  CLASS_3: 30,
  CLASS_4: 30,
};

// Air scrubber (AFD) ratios (m² per unit) — S500:2021 §12.3.2 (Engineering
// Controls). Required for all Cat 2/3; optional for Cat 1 at Class 3/4.
export const AIR_SCRUBBER_RATIO: Record<DamageClass, number> = {
  CLASS_1: 100,
  CLASS_2: 100,
  CLASS_3: 50,
  CLASS_4: 50,
};

// Negative air required for Cat 3 — S500:2021 §12.3.2 (Engineering Controls)
export const NEGATIVE_AIR_RATIO_M2_PER_UNIT = 50;

/** LGRs lose extraction efficiency in cool spaces; desiccants are rated to
 * -15°C (equipment-matrix temp ranges). Below this, substitute desiccant. */
const LOW_TEMP_DESICCANT_THRESHOLD_C = 15;

// ============================================================
// Electrical data per unit — sourced from equipment-matrix.ts group averages.
// Representative group per equipment type (mid-size deployment standard):
// ============================================================

// Resolved by stable matrix id, not array position — reordering
// lib/equipment-matrix.ts must never silently swap the representative model.
function requireGroup(id: string): EquipmentGroup {
  const group = getEquipmentGroupById(id);
  if (!group) {
    throw new Error(
      `equipment-calculator: matrix group "${id}" not found — REPRESENTATIVE_GROUP is out of sync with lib/equipment-matrix.ts`,
    );
  }
  return group;
}

const REPRESENTATIVE_GROUP: Record<
  Exclude<EquipmentType, "hepa_vacuum">,
  EquipmentGroup
> = {
  // Low-profile axial is the standard structural-drying air mover (Velo Pro / Zeus 900).
  air_mover: requireGroup("airmover-800"),
  // 85L/Day class is the most common AU site size (AlorAir Storm Pro).
  lgr_dehumidifier: requireGroup("lgr-85"),
  // Mid-size desiccant class (Corroventa A4 ES / Trotec TTR 400 D).
  desiccant_dehumidifier: requireGroup("desiccant-35"),
  // 500 CFM AFD (Dri-Eaz DefendAir HEPA 500 230V).
  air_scrubber: requireGroup("afd-500"),
  // Same AFD chassis ducted for negative-pressure configuration.
  negative_air_machine: requireGroup("afd-500"),
};

// HEPA vacuum is not emitted by this water calculator (kept in the type union
// for scope-item compatibility). Nameplate figures below are typical commercial
// values and are intentionally excluded from any emitted line item.
const HEPA_VACUUM_FALLBACK = { amps: 10, watts: 2300 };

function unitElectrical(type: EquipmentType): { amps: number; watts: number } {
  if (type === "hepa_vacuum") return HEPA_VACUUM_FALLBACK;
  const group = REPRESENTATIVE_GROUP[type];
  return { amps: group.amps, watts: group.watts };
}

function suggestedModel(type: EquipmentType): string {
  if (type === "hepa_vacuum") return "Commercial HEPA Vacuum";
  const group = REPRESENTATIVE_GROUP[type];
  const models = group.models.map((m) => m.name).join(" / ");
  return `${group.capacity} (${models})`;
}

// ============================================================
// Core Calculator
// ============================================================

function calcQty(areaM2: number, ratioM2PerUnit: number): number {
  // Equipment counts always round UP — under-drying is never defensible.
  return Math.ceil(areaM2 / ratioM2PerUnit);
}

const LABELS: Record<EquipmentType, string> = {
  air_mover: "Air Mover",
  lgr_dehumidifier: "LGR Dehumidifier",
  desiccant_dehumidifier: "Desiccant Dehumidifier",
  air_scrubber: "Air Scrubber (HEPA AFD)",
  negative_air_machine: "Negative Air Machine",
  hepa_vacuum: "HEPA Vacuum",
};

function buildItem(
  type: EquipmentType,
  quantity: number,
  ratio: number,
  areaM2: number,
  iicrcRef: string,
  justificationSuffix = "",
): EquipmentLineItem {
  const { amps, watts } = unitElectrical(type);
  const wattsTotal = watts * quantity;
  return {
    type,
    label: LABELS[type],
    quantity,
    iicrcRatio: `1 per ${ratio}m²`,
    iicrcReference: iicrcRef,
    justification:
      `${areaM2.toFixed(1)}m² ÷ ${ratio}m² = ${quantity} ${LABELS[type].toLowerCase()}${quantity !== 1 ? "s" : ""} required (rounded up)` +
      justificationSuffix,
    suggestedModel: suggestedModel(type),
    estimatedAmpsEach: amps,
    estimatedAmpsTotal: parseFloat((amps * quantity).toFixed(2)),
    estimatedWattsEach: watts,
    estimatedWattsTotal: wattsTotal,
    kwhPerDayTotal: parseFloat(wattsToKwhPerDay(wattsTotal).toFixed(2)),
  };
}

/**
 * Calculate IICRC S500-consistent equipment list for a water damage job.
 * All quantities are defensible by area ratios; all electrical figures trace
 * to sourced 230 V manufacturer specs in lib/equipment-matrix.ts.
 */
export function calculateEquipment(
  input: EquipmentCalculatorInput,
): EquipmentCalculatorResult {
  const {
    damageClass,
    damageCategory,
    floorCount = 1,
    ambientTempC,
    tariffCentsPerKwh = DEFAULT_ELECTRICITY_TARIFF_C_PER_KWH,
  } = input;
  const areaM2 = input.affectedAreaM2 * floorCount;

  const items: EquipmentLineItem[] = [];

  // 1. Air movers — always required
  const airMoverRatio = AIR_MOVER_RATIO[damageClass];
  const airMoverQty = calcQty(areaM2, airMoverRatio);
  items.push(
    buildItem(
      "air_mover",
      airMoverQty,
      airMoverRatio,
      areaM2,
      "IICRC S500:2021 §12.5 (Drying)",
    ),
  );

  // 2. Dehumidification — always required.
  // Desiccant substitutes for LGR on Class 4 (specialty drying of dense,
  // low-permeance materials needs the very low humidity ratios adsorption
  // delivers) and in cool spaces where LGR extraction efficiency collapses.
  const dehuRatio = DEHU_RATIO[damageClass];
  const dehuQty = calcQty(areaM2, dehuRatio);
  const lowTemp =
    ambientTempC !== undefined && ambientTempC < LOW_TEMP_DESICCANT_THRESHOLD_C;
  const useDesiccant = damageClass === "CLASS_4" || lowTemp;

  if (useDesiccant) {
    const reason =
      damageClass === "CLASS_4"
        ? " — desiccant selected for Class 4 specialty drying (dense/low-permeance materials require low-humidity-ratio air)"
        : ` — desiccant selected for low ambient temperature (${ambientTempC}°C < ${LOW_TEMP_DESICCANT_THRESHOLD_C}°C; adsorption units operate to -15°C)`;
    items.push(
      buildItem(
        "desiccant_dehumidifier",
        dehuQty,
        dehuRatio,
        areaM2,
        "IICRC S500:2021 §12.4.2 (Controlling Humidity and Stabilization)",
        reason,
      ),
    );
  } else {
    items.push(
      buildItem(
        "lgr_dehumidifier",
        dehuQty,
        dehuRatio,
        areaM2,
        "IICRC S500:2021 §12.4.2 (Controlling Humidity and Stabilization)",
      ),
    );
  }

  // 3. Air scrubbers (AFDs) — Cat 2/3 mandatory; Cat 1 at Class 3/4
  const requiresScrubber =
    damageCategory === "CAT_2" ||
    damageCategory === "CAT_3" ||
    (damageCategory === "CAT_1" &&
      (damageClass === "CLASS_3" || damageClass === "CLASS_4"));

  if (requiresScrubber) {
    const scrubberRatio = AIR_SCRUBBER_RATIO[damageClass];
    const scrubberQty = Math.max(1, calcQty(areaM2, scrubberRatio));
    items.push(
      buildItem(
        "air_scrubber",
        scrubberQty,
        scrubberRatio,
        areaM2,
        "IICRC S500:2021 §12.3.2 (Engineering Controls)",
      ),
    );
  }

  // 4. Negative air machines — Cat 3 only
  if (damageCategory === "CAT_3") {
    const negAirQty = Math.max(
      1,
      calcQty(areaM2, NEGATIVE_AIR_RATIO_M2_PER_UNIT),
    );
    items.push(
      buildItem(
        "negative_air_machine",
        negAirQty,
        NEGATIVE_AIR_RATIO_M2_PER_UNIT,
        areaM2,
        "IICRC S500:2021 §12.3.2 (Engineering Controls)",
      ),
    );
  }

  // ============================================================
  // Electrical load — AS/NZS 3012:2019 80% continuous-load rule.
  // Standard Australian domestic GPOs are 10 A → 8 A continuous max each.
  // 15 A / 20 A dedicated-circuit options reported alongside.
  // ============================================================
  const totalAmps = parseFloat(
    items.reduce((sum, e) => sum + e.estimatedAmpsTotal, 0).toFixed(2),
  );
  const totalWatts = items.reduce((sum, e) => sum + e.estimatedWattsTotal, 0);
  const totalKwhPerDay = parseFloat(wattsToKwhPerDay(totalWatts).toFixed(2));
  // Same negative-tariff clamp as calculateElectricityCostPerDay in
  // lib/equipment-power.ts — a bad tariff input must never produce a
  // negative dollar figure in a persisted scope item.
  const energyCostPerDay = parseFloat(
    ((totalKwhPerDay * Math.max(0, tariffCentsPerKwh)) / 100).toFixed(2),
  );

  const circuitOptions = calculateCircuitRequirements(totalAmps);
  const gpo10A = circuitOptions.find((c) => c.ratingA === 10);
  const recommendedCircuits = gpo10A?.circuitsRequired ?? 0;

  let circuitLoadWarning: string | undefined;
  if (gpo10A && totalAmps > gpo10A.maxContinuousA) {
    circuitLoadWarning =
      `Total estimated load ${totalAmps}A exceeds the AS/NZS 3012:2019 80% continuous-load rule ` +
      `(${gpo10A.maxContinuousA}A max per standard 10A GPO circuit). Distribute across ${recommendedCircuits} separate 10A circuits minimum ` +
      `(or ${circuitOptions.find((c) => c.ratingA === 15)?.circuitsRequired} × 15A / ` +
      `${circuitOptions.find((c) => c.ratingA === 20)?.circuitsRequired} × 20A dedicated circuits). ` +
      `Confirm circuit breaker ratings on-site before energising equipment.`;
  }

  // ============================================================
  // Summary
  // ============================================================
  const classNum = damageClass.replace("CLASS_", "");
  const catNum = damageCategory.replace("CAT_", "");
  const summaryParts = items.map((e) => `${e.quantity}× ${e.label}`);
  const summary =
    `IICRC S500 Category ${catNum} / Class ${classNum}: ` +
    summaryParts.join(" + ") +
    ` · ${totalKwhPerDay} kWh/day ≈ $${energyCostPerDay.toFixed(2)}/day electricity`;

  // Category/Class definitions per S500:2021 §10.4
  const iicrcClassification = `Category ${catNum} (${
    catNum === "1"
      ? "Clean Water"
      : catNum === "2"
        ? "Grey Water"
        : "Black Water"
  }) · Class ${classNum} (${
    classNum === "1"
      ? "Limited"
      : classNum === "2"
        ? "Significant"
        : classNum === "3"
          ? "Extensive"
          : "Specialty"
  } Water Intrusion)`;

  return {
    equipmentList: items,
    totalEstimatedAmps: totalAmps,
    totalEstimatedWatts: totalWatts,
    totalKwhPerDay,
    energyCostPerDay,
    tariffCentsPerKwh,
    circuitLoadWarning,
    recommendedCircuits,
    circuitOptions,
    summary,
    iicrcClassification,
  };
}
