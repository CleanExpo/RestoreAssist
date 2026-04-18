/**
 * IICRC S500 Equipment Calculator
 * Converts room dimensions + damage classification → defensible equipment list.
 *
 * Every quantity is justified by an IICRC S500 ratio applied to measured area.
 * Equipment counts are rounded UP (ceiling) per IICRC S500 §9.3.1 note.
 *
 * Electrical load validation per AS/NZS 3012:2019 80% continuous-load rule.
 */

import { lgrDehumidifiers } from "@/lib/equipment-matrix";

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
  iicrcReference: string; // e.g. "IICRC S500:2021 §9.3.2"
  justification: string; // e.g. "23.5m² ÷ 15m² = 2 air movers required"
  suggestedModel: string; // from equipment-matrix.ts
  estimatedAmpsEach: number; // nominal amp draw per unit
  estimatedAmpsTotal: number;
}

export type EquipmentType =
  | "air_mover"
  | "lgr_dehumidifier"
  | "air_scrubber"
  | "negative_air_machine"
  | "hepa_vacuum";

export interface EquipmentCalculatorInput {
  affectedAreaM2: number;
  damageClass: DamageClass;
  damageCategory: DamageCategory;
  /** Number of affected floors — multiplied into equipment count (default 1) */
  floorCount?: number;
}

export interface EquipmentCalculatorResult {
  equipmentList: EquipmentLineItem[];
  totalEstimatedAmps: number;
  /** AS/NZS 3012:2019: total load must not exceed 80% of circuit rating */
  circuitLoadWarning?: string;
  /** Recommended minimum number of 20A circuits */
  recommendedCircuits: number;
  summary: string;
  iicrcClassification: string;
}

// ============================================================
// IICRC S500 Ratios
// ============================================================

// Air mover ratios (m² per unit) — IICRC S500:2021 §9.3.2
const AIR_MOVER_RATIO: Record<DamageClass, number> = {
  CLASS_1: 15, // 1 per 15m²
  CLASS_2: 15, // 1 per 15m²
  CLASS_3: 10, // 1 per 10m² (aggressive drying)
  CLASS_4: 10, // 1 per 10m² (specialty drying)
};

// LGR dehumidifier ratios (m² per unit) — IICRC S500:2021 §9.4.1
const DEHU_RATIO: Record<DamageClass, number> = {
  CLASS_1: 40,
  CLASS_2: 40,
  CLASS_3: 30,
  CLASS_4: 30,
};

// Air scrubber ratios (m² per unit) — IICRC S500:2021 §9.5.1
// Required for all Cat 2/3; optional for Cat 1 at Class 3/4
const AIR_SCRUBBER_RATIO: Record<DamageClass, number> = {
  CLASS_1: 100,
  CLASS_2: 100,
  CLASS_3: 50,
  CLASS_4: 50,
};

// Negative air required for Cat 3 — IICRC S500:2021 §9.5.3
const NEGATIVE_AIR_RATIO_M2_PER_UNIT = 50;

// ============================================================
// Nominal amp draw per unit (from equipment-matrix.ts averages)
// ============================================================

const AMPS: Record<EquipmentType, number> = {
  air_mover: 1.5, // typical 1/4HP Axial air mover
  lgr_dehumidifier: 5.02, // lgr-85 average (most common AU site size)
  air_scrubber: 3.0, // 500-700 CFM average
  negative_air_machine: 9.0, // typically 8-12A
  hepa_vacuum: 10.0, // commercial HEPA vacuum
};

// Suggested model labels (display only)
const SUGGESTED_MODEL: Record<EquipmentType, string> = {
  air_mover: "Axial Air Mover (any 1/4HP+)",
  lgr_dehumidifier: "85L/Day Ave LGR (Dri-Eaz LGR 7000 / ThorAir 85L Pro)",
  air_scrubber: "500 CFM Air Scrubber (HEPA)",
  negative_air_machine: "Negative Air Machine w/ HEPA",
  hepa_vacuum: "Commercial HEPA Vacuum",
};

// ============================================================
// Core Calculator
// ============================================================

function calcQty(areaM2: number, ratioM2PerUnit: number): number {
  // IICRC S500 §9.3.1 note: always round UP
  return Math.ceil(areaM2 / ratioM2PerUnit);
}

function buildItem(
  type: EquipmentType,
  quantity: number,
  ratio: number,
  areaM2: number,
  iicrcRef: string,
): EquipmentLineItem {
  const labels: Record<EquipmentType, string> = {
    air_mover: "Air Mover",
    lgr_dehumidifier: "LGR Dehumidifier",
    air_scrubber: "Air Scrubber (HEPA)",
    negative_air_machine: "Negative Air Machine",
    hepa_vacuum: "HEPA Vacuum",
  };
  const amps = AMPS[type];
  return {
    type,
    label: labels[type],
    quantity,
    iicrcRatio: `1 per ${ratio}m²`,
    iicrcReference: iicrcRef,
    justification: `${areaM2.toFixed(1)}m² ÷ ${ratio}m² = ${quantity} ${labels[type].toLowerCase()}${quantity !== 1 ? "s" : ""} required (IICRC rounds up)`,
    suggestedModel: SUGGESTED_MODEL[type],
    estimatedAmpsEach: amps,
    estimatedAmpsTotal: parseFloat((amps * quantity).toFixed(2)),
  };
}

/**
 * Calculate IICRC S500-compliant equipment list for a water damage job.
 * All quantities are defensible by IICRC ratios applied to measured area.
 */
export function calculateEquipment(
  input: EquipmentCalculatorInput,
): EquipmentCalculatorResult {
  const { damageClass, damageCategory, floorCount = 1 } = input;
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
      "IICRC S500:2021 §9.3.2",
    ),
  );

  // 2. LGR dehumidifiers — always required
  const dehuRatio = DEHU_RATIO[damageClass];
  const dehuQty = calcQty(areaM2, dehuRatio);
  items.push(
    buildItem(
      "lgr_dehumidifier",
      dehuQty,
      dehuRatio,
      areaM2,
      "IICRC S500:2021 §9.4.1",
    ),
  );

  // 3. Air scrubbers — Cat 2/3 mandatory; Cat 1 at Class 3/4
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
        "IICRC S500:2021 §9.5.1",
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
        "IICRC S500:2021 §9.5.3",
      ),
    );
  }

  // ============================================================
  // Electrical load check — AS/NZS 3012:2019 80% rule
  // Standard 20A circuit × 80% = 16A maximum continuous load
  // ============================================================
  const totalAmps = parseFloat(
    items.reduce((sum, e) => sum + e.estimatedAmpsTotal, 0).toFixed(2),
  );
  const maxAmpsPerCircuit = 16; // 20A × 80%
  const recommendedCircuits = Math.ceil(totalAmps / maxAmpsPerCircuit);

  let circuitLoadWarning: string | undefined;
  if (totalAmps > maxAmpsPerCircuit) {
    circuitLoadWarning =
      `Total estimated load ${totalAmps}A exceeds AS/NZS 3012:2019 80% continuous-load rule ` +
      `(16A max per 20A circuit). Use ${recommendedCircuits} separate circuits minimum. ` +
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
    summaryParts.join(" + ");

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
    circuitLoadWarning,
    recommendedCircuits,
    summary,
    iicrcClassification,
  };
}

// ============================================================
// Fire & Smoke Equipment — IICRC S700:2015
// ============================================================

export type FireEquipmentType =
  | "ozone_generator"
  | "hydroxyl_unit"
  | "hepa_vacuum"
  | "afd_unit";

export interface FireEquipmentLineItem {
  type: FireEquipmentType;
  label: string;
  quantity: number;
  /** e.g. "1 per 200m²" */
  iicrcRatio: string;
  /** e.g. "IICRC S700:2015 §6.3" */
  iicrcReference: string;
  justification: string;
}

export interface FireEquipmentInput {
  /** Total fire/smoke affected area in m² */
  affectedAreaM2: number;
}

export interface FireEquipmentResult {
  equipmentList: FireEquipmentLineItem[];
  summary: string;
}

// S700:2015 equipment ratios (m² per unit)
const FIRE_RATIOS: Record<FireEquipmentType, number> = {
  ozone_generator: 200, // S700:2015 §6.3 — 1 per 200m²
  hydroxyl_unit: 150, // S700:2015 §6.3 — 1 per 150m²
  hepa_vacuum: 100, // S700:2015 §6.2 — 1 per 100m²
  afd_unit: 150, // S700:2015 §9.1 — 1 per 150m²
};

const FIRE_LABELS: Record<FireEquipmentType, string> = {
  ozone_generator: "Ozone Generator",
  hydroxyl_unit: "Hydroxyl Unit",
  hepa_vacuum: "HEPA Vacuum",
  afd_unit: "Air Filtration Device (AFD)",
};

const FIRE_REFS: Record<FireEquipmentType, string> = {
  ozone_generator: "IICRC S700:2015 §6.3",
  hydroxyl_unit: "IICRC S700:2015 §6.3",
  hepa_vacuum: "IICRC S700:2015 §6.2",
  afd_unit: "IICRC S700:2015 §9.1",
};

/**
 * Calculate IICRC S700:2015-compliant equipment list for a fire/smoke job.
 * Quantities are rounded UP per IICRC convention.
 */
export function calculateFireEquipment(
  input: FireEquipmentInput,
): FireEquipmentResult {
  const { affectedAreaM2 } = input;

  const equipmentTypes: FireEquipmentType[] = [
    "ozone_generator",
    "hydroxyl_unit",
    "hepa_vacuum",
    "afd_unit",
  ];

  const equipmentList: FireEquipmentLineItem[] = equipmentTypes.map((type) => {
    const ratio = FIRE_RATIOS[type];
    const quantity = Math.ceil(affectedAreaM2 / ratio);
    const label = FIRE_LABELS[type];
    return {
      type,
      label,
      quantity,
      iicrcRatio: `1 per ${ratio}m²`,
      iicrcReference: FIRE_REFS[type],
      justification: `${affectedAreaM2.toFixed(1)}m² ÷ ${ratio}m² = ${quantity} ${label}${quantity !== 1 ? "s" : ""} required (IICRC rounds up)`,
    };
  });

  const summaryParts = equipmentList.map((e) => `${e.quantity}× ${e.label}`);
  const summary = `IICRC S700 Fire/Smoke Equipment (${affectedAreaM2}m²): ${summaryParts.join(" + ")}`;

  return { equipmentList, summary };
}
