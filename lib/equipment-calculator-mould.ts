/**
 * RA-872: IICRC S520 Mould Equipment Calculator
 *
 * Converts mould-affected area + IICRC contamination condition → defensible
 * equipment list. Mirrors the water/fire calculators' ratio-driven pattern.
 *
 * IICRC S520:2015 Condition classification:
 *   - Condition 1: normal fungal ecology (no remediation)
 *   - Condition 2: settled spores / traces of amplification
 *   - Condition 3: actual fungal growth / active amplification
 *
 * Containment requirements scale with condition — Condition 3 always requires
 * negative-air and HEPA filtration within a 6-sided containment (§12).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MouldCondition = "CONDITION_2" | "CONDITION_3";

/**
 * Containment level per IICRC S520:2015 §12.
 * - LIMITED: poly sheeting, single-entry flap (≤ 10 ft²)
 * - FULL: 6-sided containment with negative-air + decon chamber
 * - SOURCE_CONTROL: small polybag enclosure for single item / small area
 */
export type ContainmentLevel = "SOURCE_CONTROL" | "LIMITED" | "FULL";

export type MouldEquipmentType =
  | "negative_air_machine"
  | "air_scrubber_hepa"
  | "hepa_vacuum"
  | "dehumidifier_lgr";

export interface MouldEquipmentLineItem {
  type: MouldEquipmentType;
  label: string;
  quantity: number;
  iicrcRatio: string;
  iicrcReference: string;
  justification: string;
  suggestedModel: string;
  estimatedAmpsEach: number;
  estimatedAmpsTotal: number;
}

export interface MouldEquipmentCalculatorInput {
  affectedAreaM2: number;
  condition: MouldCondition;
  /** Containment level required — auto-selected from area + condition when omitted. */
  containment?: ContainmentLevel;
  floorCount?: number;
  /** Current ambient RH % — drives dehumidifier requirement. Default 60%. */
  ambientRelativeHumidity?: number;
}

export interface MouldEquipmentCalculatorResult {
  equipmentList: MouldEquipmentLineItem[];
  totalEstimatedAmps: number;
  circuitLoadWarning?: string;
  recommendedCircuits: number;
  containmentLevel: ContainmentLevel;
  summary: string;
  iicrcClassification: string;
}

// ─── IICRC S520 Ratios ────────────────────────────────────────────────────────

/**
 * Negative-air machine (NAM) m²/unit — S520:2015 §12.3.
 * Goal: 4+ air changes per hour at 2.4m ceiling height.
 */
const NAM_RATIO: Record<MouldCondition, number> = {
  CONDITION_2: 100, // limited amplification
  CONDITION_3: 60, // active amplification — tighter ratio
};

/** Air scrubber m²/unit — S520:2015 §12.4 (HEPA particulate filtration during work). */
const AIR_SCRUBBER_RATIO: Record<MouldCondition, number> = {
  CONDITION_2: 90,
  CONDITION_3: 50,
};

/** HEPA vacuum m²/unit — S520:2015 §8.4.3. */
const HEPA_VACUUM_RATIO = 80;

/** LGR dehu m²/unit — S520:2015 §7.2 when RH > 60%. */
const DEHU_RATIO = 40;

/** Auto-containment decision: area + condition → containment level. */
function selectContainment(
  areaM2: number,
  condition: MouldCondition,
): ContainmentLevel {
  // IICRC S520:2015 §12 — condition + area thresholds
  if (areaM2 < 1) return "SOURCE_CONTROL";
  if (condition === "CONDITION_3" && areaM2 >= 9) return "FULL"; // ~100 ft²
  if (condition === "CONDITION_3") return "LIMITED";
  if (areaM2 >= 30) return "FULL"; // large Condition 2 → treat as FULL
  return "LIMITED";
}

// ─── Amps + labels ────────────────────────────────────────────────────────────

const AMPS: Record<MouldEquipmentType, number> = {
  negative_air_machine: 9.0,
  air_scrubber_hepa: 3.0,
  hepa_vacuum: 10.0,
  dehumidifier_lgr: 5.02,
};

const SUGGESTED: Record<MouldEquipmentType, string> = {
  negative_air_machine: "2000 CFM NAM with HEPA stage (Abatement PRED1200+)",
  air_scrubber_hepa: "500-700 CFM Air Scrubber (HEPA)",
  hepa_vacuum: "Commercial HEPA Vacuum",
  dehumidifier_lgr: "85L/Day LGR (Dri-Eaz LGR 7000)",
};

const LABEL: Record<MouldEquipmentType, string> = {
  negative_air_machine: "Negative Air Machine",
  air_scrubber_hepa: "Air Scrubber (HEPA)",
  hepa_vacuum: "HEPA Vacuum",
  dehumidifier_lgr: "LGR Dehumidifier",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcQty(areaM2: number, ratio: number): number {
  if (ratio <= 0) return 0;
  return Math.ceil(areaM2 / ratio);
}

function buildItem(
  type: MouldEquipmentType,
  quantity: number,
  ratio: number,
  areaM2: number,
  iicrcRef: string,
): MouldEquipmentLineItem {
  const amps = AMPS[type];
  return {
    type,
    label: LABEL[type],
    quantity,
    iicrcRatio: `1 per ${ratio}m²`,
    iicrcReference: iicrcRef,
    justification: `${areaM2.toFixed(1)}m² ÷ ${ratio}m² = ${quantity} ${LABEL[type].toLowerCase()}${quantity !== 1 ? "s" : ""} required (IICRC rounds up)`,
    suggestedModel: SUGGESTED[type],
    estimatedAmpsEach: amps,
    estimatedAmpsTotal: parseFloat((amps * quantity).toFixed(2)),
  };
}

// ─── Core calculator ──────────────────────────────────────────────────────────

/**
 * Calculate IICRC S520-compliant equipment list for a mould remediation job.
 * Containment level is auto-selected from area + condition unless overridden.
 */
export function calculateMouldEquipment(
  input: MouldEquipmentCalculatorInput,
): MouldEquipmentCalculatorResult {
  const { condition, floorCount = 1, ambientRelativeHumidity = 60 } = input;
  const areaM2 = input.affectedAreaM2 * floorCount;
  const containment = input.containment ?? selectContainment(areaM2, condition);
  const items: MouldEquipmentLineItem[] = [];

  // 1. Negative Air Machines — required for LIMITED + FULL containment
  if (containment !== "SOURCE_CONTROL") {
    const namRatio = NAM_RATIO[condition];
    const namQty = calcQty(areaM2, namRatio);
    items.push(
      buildItem(
        "negative_air_machine",
        namQty,
        namRatio,
        areaM2,
        "IICRC S520:2015 §12.3 — Negative pressure containment",
      ),
    );
  }

  // 2. Air scrubbers — required for all containment levels
  const asRatio = AIR_SCRUBBER_RATIO[condition];
  const asQty = calcQty(areaM2, asRatio);
  items.push(
    buildItem(
      "air_scrubber_hepa",
      asQty,
      asRatio,
      areaM2,
      "IICRC S520:2015 §12.4 — HEPA air scrubbing during work",
    ),
  );

  // 3. HEPA vacuum — always required for spore collection
  const vacQty = calcQty(areaM2, HEPA_VACUUM_RATIO);
  items.push(
    buildItem(
      "hepa_vacuum",
      vacQty,
      HEPA_VACUUM_RATIO,
      areaM2,
      "IICRC S520:2015 §8.4.3 — HEPA vacuuming",
    ),
  );

  // 4. LGR dehu — required when ambient RH > 60% to prevent re-amplification
  if (ambientRelativeHumidity > 60) {
    const dehuQty = calcQty(areaM2, DEHU_RATIO);
    items.push(
      buildItem(
        "dehumidifier_lgr",
        dehuQty,
        DEHU_RATIO,
        areaM2,
        "IICRC S520:2015 §7.2 — Humidity control (RH > 60%)",
      ),
    );
  }

  // ─── Totals ─────────────────────────────────────────────────────────────────

  const totalAmps = items.reduce((sum, i) => sum + i.estimatedAmpsTotal, 0);
  const recommendedCircuits = Math.max(1, Math.ceil(totalAmps / 16));

  let circuitLoadWarning: string | undefined;
  if (totalAmps > 16 * recommendedCircuits * 0.8) {
    circuitLoadWarning = `Total ${totalAmps.toFixed(1)}A exceeds 80% of ${recommendedCircuits} × 20A circuits — add additional circuits or stagger equipment`;
  }

  return {
    equipmentList: items,
    totalEstimatedAmps: parseFloat(totalAmps.toFixed(2)),
    circuitLoadWarning,
    recommendedCircuits,
    containmentLevel: containment,
    summary: `${condition.replace("_", " ")} mould remediation over ${areaM2.toFixed(0)}m² (${containment.replace("_", " ")} containment) → ${items.length} equipment types, ${totalAmps.toFixed(1)}A total`,
    iicrcClassification: `IICRC S520:2015 — ${condition.replace("_", " ")} (${containment.replace("_", " ")} containment)`,
  };
}
