/**
 * ANSI/IICRC S500:2021 class of water — the evaporation load / amount of affected
 * material (spec §5.2). Distinct from water Category (contamination, see
 * `water-category.ts`): Class drives the drying-equipment sizing.
 *
 * Inputs are assessor observations; thresholds are S500-aligned defaults
 * (~600mm ≈ the 24in wicking marker). Class 4 (specialty drying — deeply held
 * moisture in low-permeance materials) overrides the others.
 */

export type WaterClass = 1 | 2 | 3 | 4;

export interface ClassInput {
  /** Fraction (0..1) of the room footprint affected. */
  affectedAreaFraction?: number;
  /** Height (mm) water has wicked up walls. */
  wickHeightMm?: number;
  /** Ceilings / upper walls saturated (water from above). */
  waterFromOverhead?: boolean;
  /** Deeply held moisture in low-permeance materials (hardwood, plaster, concrete). */
  lowPermeanceMaterialsSaturated?: boolean;
}

export interface ClassResult {
  waterClass: WaterClass;
  label: string;
  dryingImplication: string;
}

const WICK_HIGH_MM = 600;

const RESULTS: Record<WaterClass, Omit<ClassResult, "waterClass">> = {
  1: {
    label: "Class 1 — least amount of water",
    dryingImplication:
      "Minimal moisture and low evaporation load; standard drying with limited equipment.",
  },
  2: {
    label: "Class 2 — significant amount of water",
    dryingImplication:
      "Whole-room saturation with limited wicking; increased dehumidification and air movement.",
  },
  3: {
    label: "Class 3 — greatest amount of water",
    dryingImplication:
      "Water from overhead or high wicking; maximum air movers and dehumidification across ceilings, walls and subfloor.",
  },
  4: {
    label: "Class 4 — specialty drying situation",
    dryingImplication:
      "Deeply held/bound moisture in low-permeance materials; requires specialty methods (heat, desiccant, extended drying).",
  },
};

export function classifyWater(input: ClassInput): ClassResult {
  let waterClass: WaterClass;

  if (input.lowPermeanceMaterialsSaturated) {
    waterClass = 4;
  } else if (
    input.waterFromOverhead ||
    (input.wickHeightMm ?? 0) > WICK_HIGH_MM
  ) {
    waterClass = 3;
  } else if (
    (input.affectedAreaFraction ?? 0) >= 0.4 ||
    (input.wickHeightMm ?? 0) > 0
  ) {
    waterClass = 2;
  } else {
    waterClass = 1;
  }

  return { waterClass, ...RESULTS[waterClass] };
}
