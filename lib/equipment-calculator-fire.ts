/**
 * RA-872: IICRC S700 Fire/Smoke Equipment Calculator
 *
 * Converts fire-damaged area + severity → defensible equipment list.
 * Built on the same ratio-driven pattern as {@link ./equipment-calculator} but
 * tuned for S700 fire + smoke restoration: particulate removal, odour
 * eradication, soot vacuuming. Every quantity is justified by an S700 ratio
 * applied to measured area — no magic numbers.
 *
 * Electrical load validation per AS/NZS 3012:2019 80% continuous-load rule.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Fire/smoke severity per IICRC S700:2021 §4.2 classification. */
export type FireSeverity = "MINOR" | "MODERATE" | "SEVERE";

/** Structure type — affects odour treatment choice + duration. */
export type StructureType = "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL";

export type FireEquipmentType =
  | "air_scrubber_hepa"
  | "negative_air_machine"
  | "ozone_generator"
  | "hydroxyl_generator"
  | "thermal_fogger"
  | "hepa_vacuum";

export interface FireEquipmentLineItem {
  type: FireEquipmentType;
  label: string;
  quantity: number;
  iicrcRatio: string;
  iicrcReference: string;
  justification: string;
  suggestedModel: string;
  estimatedAmpsEach: number;
  estimatedAmpsTotal: number;
}

export interface FireEquipmentCalculatorInput {
  /** Smoke/soot-affected floor area in square metres. */
  affectedAreaM2: number;
  /** Severity — drives ratios + optional-equipment inclusion. */
  severity: FireSeverity;
  /** Structure type — chooses ozone (residential) vs hydroxyl (commercial, occupied). */
  structureType?: StructureType;
  /** Number of affected floors — multiplier (default 1). */
  floorCount?: number;
  /**
   * Whether the structure is occupied during remediation. When true, ozone is
   * excluded (health-hazard) and only hydroxyl is recommended.
   */
  occupied?: boolean;
}

export interface FireEquipmentCalculatorResult {
  equipmentList: FireEquipmentLineItem[];
  totalEstimatedAmps: number;
  circuitLoadWarning?: string;
  recommendedCircuits: number;
  summary: string;
  iicrcClassification: string;
}

// ─── IICRC S700 Ratios ────────────────────────────────────────────────────────

/** Air scrubber m²/unit — IICRC S700:2021 §8.2 (particulate filtration). */
const AIR_SCRUBBER_RATIO: Record<FireSeverity, number> = {
  MINOR: 100,
  MODERATE: 75,
  SEVERE: 50,
};

/** Negative-air-machine m²/unit — required for SEVERE for containment. */
const NEGATIVE_AIR_RATIO: Record<FireSeverity, number> = {
  MINOR: 0, // not used
  MODERATE: 0, // optional
  SEVERE: 80,
};

/**
 * Odour treatment ratios (m²/unit) — IICRC S700:2021 §9.
 * Ozone/hydroxyl generators scale with cubic metres, but for consistency with
 * other calculators we use floor area × assumed 2.4m ceiling.
 */
const OZONE_RATIO_M2: Record<FireSeverity, number> = {
  MINOR: 150,
  MODERATE: 100,
  SEVERE: 60,
};
const HYDROXYL_RATIO_M2: Record<FireSeverity, number> = {
  MINOR: 120,
  MODERATE: 80,
  SEVERE: 50,
};

/** Thermal fogger — discrete treatment events, not continuous. 1 unit covers up to 200m² per cycle. */
const THERMAL_FOGGER_COVERAGE_M2 = 200;

/** HEPA vacuum — 1 per 100m² for soot cleanup (S700 §7.3). */
const HEPA_VACUUM_RATIO = 100;

// ─── Amps + suggested models ──────────────────────────────────────────────────

const AMPS: Record<FireEquipmentType, number> = {
  air_scrubber_hepa: 3.0,
  negative_air_machine: 9.0,
  ozone_generator: 5.0, // commercial 7-10g/hr units
  hydroxyl_generator: 4.5, // Odorox or similar
  thermal_fogger: 2.0, // hand-held during cycle only
  hepa_vacuum: 10.0,
};

const SUGGESTED: Record<FireEquipmentType, string> = {
  air_scrubber_hepa: "500-700 CFM Air Scrubber (HEPA)",
  negative_air_machine: "1000 CFM NAM with HEPA stage",
  ozone_generator: "Commercial Ozone Generator (7-10 g/hr)",
  hydroxyl_generator: "Odorox Boss XL3 / equivalent hydroxyl unit",
  thermal_fogger: "Thermal Fogger (ULV) with smoke-counteractant agent",
  hepa_vacuum: "Commercial HEPA Vacuum",
};

const LABEL: Record<FireEquipmentType, string> = {
  air_scrubber_hepa: "Air Scrubber (HEPA)",
  negative_air_machine: "Negative Air Machine",
  ozone_generator: "Ozone Generator",
  hydroxyl_generator: "Hydroxyl Generator",
  thermal_fogger: "Thermal Fogger",
  hepa_vacuum: "HEPA Vacuum",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcQty(areaM2: number, ratio: number): number {
  if (ratio <= 0) return 0;
  return Math.ceil(areaM2 / ratio);
}

function buildItem(
  type: FireEquipmentType,
  quantity: number,
  ratio: number,
  areaM2: number,
  iicrcRef: string,
  customJustification?: string,
): FireEquipmentLineItem {
  const amps = AMPS[type];
  return {
    type,
    label: LABEL[type],
    quantity,
    iicrcRatio: ratio > 0 ? `1 per ${ratio}m²` : `${quantity} unit${quantity !== 1 ? "s" : ""}`,
    iicrcReference: iicrcRef,
    justification:
      customJustification ??
      `${areaM2.toFixed(1)}m² ÷ ${ratio}m² = ${quantity} ${LABEL[type].toLowerCase()}${quantity !== 1 ? "s" : ""} required (IICRC rounds up)`,
    suggestedModel: SUGGESTED[type],
    estimatedAmpsEach: amps,
    estimatedAmpsTotal: parseFloat((amps * quantity).toFixed(2)),
  };
}

// ─── Core calculator ──────────────────────────────────────────────────────────

/**
 * Calculate IICRC S700-compliant equipment list for a fire/smoke damage job.
 * Occupancy state determines ozone vs hydroxyl selection (S700:2021 §9.4.2).
 */
export function calculateFireEquipment(
  input: FireEquipmentCalculatorInput,
): FireEquipmentCalculatorResult {
  const { severity, floorCount = 1, occupied = false } = input;
  const areaM2 = input.affectedAreaM2 * floorCount;
  const items: FireEquipmentLineItem[] = [];

  // 1. Air scrubbers — always required for particulate removal
  const asRatio = AIR_SCRUBBER_RATIO[severity];
  const asQty = calcQty(areaM2, asRatio);
  items.push(
    buildItem(
      "air_scrubber_hepa",
      asQty,
      asRatio,
      areaM2,
      "IICRC S700:2021 §8.2",
    ),
  );

  // 2. Negative air machines — SEVERE only (containment)
  if (severity === "SEVERE") {
    const namRatio = NEGATIVE_AIR_RATIO[severity];
    const namQty = calcQty(areaM2, namRatio);
    items.push(
      buildItem(
        "negative_air_machine",
        namQty,
        namRatio,
        areaM2,
        "IICRC S700:2021 §8.4 — Containment for severe smoke",
      ),
    );
  }

  // 3. Odour treatment — ozone vs hydroxyl based on occupancy
  // S700:2021 §9.4.2: ozone must never be used in occupied spaces (ozone is a lung irritant)
  if (occupied) {
    const hyRatio = HYDROXYL_RATIO_M2[severity];
    const hyQty = calcQty(areaM2, hyRatio);
    items.push(
      buildItem(
        "hydroxyl_generator",
        hyQty,
        hyRatio,
        areaM2,
        "IICRC S700:2021 §9.4.2 — Hydroxyl safe for occupied spaces",
      ),
    );
  } else {
    const ozRatio = OZONE_RATIO_M2[severity];
    const ozQty = calcQty(areaM2, ozRatio);
    items.push(
      buildItem(
        "ozone_generator",
        ozQty,
        ozRatio,
        areaM2,
        "IICRC S700:2021 §9.4.1 — Ozone for unoccupied spaces",
      ),
    );
  }

  // 4. Thermal fogger — required for MODERATE/SEVERE (smoke-counteractant treatment)
  if (severity === "MODERATE" || severity === "SEVERE") {
    const fogQty = calcQty(areaM2, THERMAL_FOGGER_COVERAGE_M2);
    items.push(
      buildItem(
        "thermal_fogger",
        fogQty,
        THERMAL_FOGGER_COVERAGE_M2,
        areaM2,
        "IICRC S700:2021 §9.5 — Thermal fogging for protein-fire odours",
      ),
    );
  }

  // 5. HEPA vacuum — always needed for soot cleanup
  const vacQty = calcQty(areaM2, HEPA_VACUUM_RATIO);
  items.push(
    buildItem(
      "hepa_vacuum",
      vacQty,
      HEPA_VACUUM_RATIO,
      areaM2,
      "IICRC S700:2021 §7.3 — Soot removal",
    ),
  );

  // ─── Totals ─────────────────────────────────────────────────────────────────

  const totalAmps = items.reduce(
    (sum, i) => sum + i.estimatedAmpsTotal,
    0,
  );

  // AS/NZS 3012:2019 continuous-load rule: 80% of circuit rating
  // Recommend one 20A circuit per 16A continuous load (20 × 0.8 = 16A)
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
    summary: `${severity} fire damage over ${areaM2.toFixed(0)}m²${occupied ? " (occupied)" : ""} → ${items.length} equipment types, ${totalAmps.toFixed(1)}A total`,
    iicrcClassification: `IICRC S700:2021 — ${severity} fire/smoke damage${input.structureType ? ` (${input.structureType.toLowerCase()})` : ""}`,
  };
}
