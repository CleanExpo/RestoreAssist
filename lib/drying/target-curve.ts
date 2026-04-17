/**
 * computeTargetCurve — exponential-decay drying model
 *
 * Models the expected moisture content (MC%) over time as:
 *   MC(d) = finalMC + (initialMC − finalMC) × exp(−k × d)
 *
 * where k is adjusted for material type, water category, water class,
 * room volume, and dehumidifier capacity per AS-IICRC S500:2025 §12.2.2.
 *
 * No persistence — this is a pure computation; results are not stored.
 * If persistence is required, STOP and discuss before adding a migration.
 *
 * References:
 *   AS-IICRC S500:2025 §12.2.2 — Restoration drying rate factors
 *   AS-IICRC S500:2025 Appendix C — Per-material dry standard references
 */

import {
  MATERIAL_TARGETS,
  CATEGORY_K_MULTIPLIER,
  CLASS_K_MULTIPLIER,
} from "./material-mc-targets";

export interface TargetCurveInput {
  /** Initial moisture content reading (%) at Day 0 */
  initialMC: number;
  /** Material key matching lib/iicrc-dry-standards.ts (e.g. "timber", "plasterboard") */
  materialType: string;
  /** IICRC water category: "Category 1" | "Category 2" | "Category 3" */
  category: string;
  /** IICRC water class: "Class 1" | "Class 2" | "Class 3" | "Class 4" */
  waterClass: string;
  /** Room volume in cubic metres (used to scale dehumidifier effectiveness) */
  roomVolumeM3: number;
  /** Dehumidifier capacity in litres per day (L/day) */
  dehumidifierCapacityLpd: number;
}

export interface TargetCurvePoint {
  day: number;
  targetMC: number;
}

export interface TargetCurveResult {
  /** Daily target MC values starting at day 0 */
  daily: TargetCurvePoint[];
  /** Day number when target MC is first reached (interpolated) */
  projectedCompletionDay: number;
  /** Effective k used in the model (day⁻¹) — for audit/reporting */
  effectiveK: number;
  /** Final (dry standard) MC target for this material */
  finalMC: number;
  /** Standards citation for this computation */
  standardsRef: string;
}

/**
 * Reference dehumidifier capacity (L/day) and room volume (m³) used when
 * calibrating baseK values in material-mc-targets.ts.
 * Per S500:2025 §12.2.2: capacity-to-volume ratio drives drying rate.
 */
const REF_DEHU_LPD = 50;
const REF_ROOM_M3 = 25;
const MAX_DAYS = 90; // Guard against infinite loops on very slow materials

/**
 * Compute the exponential decay target drying curve.
 *
 * @param input — material + job parameters
 * @returns daily target points, projected completion day, and audit fields
 *
 * Formula: MC(d) = finalMC + (initialMC − finalMC) × exp(−effectiveK × d)
 * effectiveK = baseK × categoryMult × classMult × (dehuLpd / refLpd) × (refM3 / roomM3)
 *
 * S500:2025 §12.2.2 recognises dehumidifier capacity, water category, and water
 * class as the primary factors controlling drying rate.
 */
export function computeTargetCurve(input: TargetCurveInput): TargetCurveResult {
  const {
    initialMC,
    materialType,
    category,
    waterClass,
    roomVolumeM3,
    dehumidifierCapacityLpd,
  } = input;

  const mat = MATERIAL_TARGETS[materialType] ?? MATERIAL_TARGETS["other"];
  const { finalMC, baseK } = mat;

  // Clamp initialMC to be at least finalMC (can't start below the dry target)
  const startMC = Math.max(initialMC, finalMC);

  // If already dry at or below final target, return a single-point curve
  if (startMC <= finalMC) {
    return {
      daily: [{ day: 0, targetMC: round2(finalMC) }],
      projectedCompletionDay: 0,
      effectiveK: baseK,
      finalMC,
      standardsRef: "AS-IICRC S500:2025 §12.2.2",
    };
  }

  const categoryMult = CATEGORY_K_MULTIPLIER[category] ?? 1.0;
  const classMult = CLASS_K_MULTIPLIER[waterClass] ?? 1.0;

  // Dehumidifier effectiveness: scale linearly relative to reference values
  // (S500:2025 §12.2.2 — capacity/volume ratio)
  const roomM3 = Math.max(roomVolumeM3, 1); // guard zero
  const dehuLpd = Math.max(dehumidifierCapacityLpd, 1); // guard zero
  const dehuMult = (dehuLpd / REF_DEHU_LPD) * (REF_ROOM_M3 / roomM3);

  const effectiveK = baseK * categoryMult * classMult * dehuMult;

  // Build daily points from day 0 up to MAX_DAYS
  const daily: TargetCurvePoint[] = [];
  let projectedCompletionDay = MAX_DAYS;

  for (let d = 0; d <= MAX_DAYS; d++) {
    const mc = finalMC + (startMC - finalMC) * Math.exp(-effectiveK * d);
    const targetMC = round2(Math.max(mc, finalMC));
    daily.push({ day: d, targetMC });

    // First day where curve touches or crosses the final target
    if (mc <= finalMC && projectedCompletionDay === MAX_DAYS) {
      projectedCompletionDay = d;
    }
  }

  return {
    daily,
    projectedCompletionDay,
    effectiveK: round2(effectiveK),
    finalMC,
    standardsRef: "AS-IICRC S500:2025 §12.2.2",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
