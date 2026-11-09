/**
 * Hard Floor add-on — safety and quality gates.
 *
 * 1. Asbestos gate (SOP 1): vinyl/lino-type floors laid before 1990, or of
 *    unknown age, are presumed to contain asbestos unless an assessment says
 *    otherwise (NSW Asbestos Awareness; WHSQ "Asbestos flooring" PN10167).
 *    A presume result locks out dry and abrasive methods; damage stops work.
 * 2. Seal gate (SOP 3/6): sealer and finish may only go down once the
 *    rinsed floor reads pH 7–8. Stripper residue stops new finish curing.
 * 3. Chemistry check (SOP 3): a solution's pH must sit inside the floor
 *    type's window for the purpose (clean or strip).
 */

import { getFloorSop } from "./sop-library";
import type { FloorType, RestrictedAction } from "./types";

export const ASBESTOS_CUTOFF_YEAR = 1990;

/** Restricted actions under a presume-asbestos result. */
export const ASBESTOS_RESTRICTED_ACTIONS: readonly RestrictedAction[] = [
  "dry_strip",
  "black_pad",
  "brown_pad",
  "high_speed_burnish",
  "sanding",
];

export interface AsbestosGateInput {
  floorType: FloorType;
  /** Year the floor was laid, or null when nobody knows. */
  yearLaid: number | null;
  /** A licensed assessor or the asbestos register confirms it is asbestos-free. */
  confirmedAsbestosFree: boolean;
  /** Any tile broken, lifting or crumbling. */
  damaged: boolean;
}

export type AsbestosGateResult =
  | { result: "clear"; restricted: readonly RestrictedAction[]; reason: string }
  | { result: "presume"; restricted: readonly RestrictedAction[]; reason: string }
  | { result: "stop"; restricted: readonly RestrictedAction[]; reason: string };

export function evaluateAsbestosGate(input: AsbestosGateInput): AsbestosGateResult {
  const sop = getFloorSop(input.floorType);
  if (!sop.asbestosRisk) {
    return { result: "clear", restricted: [], reason: "Floor type is not an asbestos-risk material." };
  }
  if (input.confirmedAsbestosFree) {
    return { result: "clear", restricted: [], reason: "Confirmed asbestos-free." };
  }
  const oldOrUnknown = input.yearLaid === null || input.yearLaid < ASBESTOS_CUTOFF_YEAR;
  if (!oldOrUnknown) {
    return { result: "clear", restricted: [], reason: `Laid ${input.yearLaid}, after ${ASBESTOS_CUTOFF_YEAR}.` };
  }
  if (input.damaged) {
    return {
      result: "stop",
      restricted: ASBESTOS_RESTRICTED_ACTIONS,
      reason: "Presumed asbestos and the floor is damaged. Stop work and report it.",
    };
  }
  return {
    result: "presume",
    restricted: ASBESTOS_RESTRICTED_ACTIONS,
    reason: "Presume asbestos: wet methods only, lowest speed, no black or brown pads.",
  };
}

/** True when the gate result forbids the action. */
export function isActionAllowed(gate: AsbestosGateResult, action: RestrictedAction): boolean {
  if (gate.result === "stop") return false;
  return !gate.restricted.includes(action);
}

export const SEAL_PH_MIN = 7;
export const SEAL_PH_MAX = 8;

export interface PhReading {
  ph: number;
  /** ISO timestamp of the reading. */
  takenAt: string;
}

export type SealGateResult = { ok: true } | { ok: false; reason: string };

/**
 * The Seal step unlocks only when the most recent post-rinse floor reading
 * is within 7–8. No reading means no seal.
 */
export function canSeal(floorReadings: readonly PhReading[]): SealGateResult {
  if (floorReadings.length === 0) {
    return { ok: false, reason: "Record a post-rinse floor pH reading before sealing." };
  }
  const latest = [...floorReadings].sort(
    (a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt),
  )[0];
  if (!Number.isFinite(latest.ph)) {
    return { ok: false, reason: "The latest pH reading is not a number." };
  }
  if (latest.ph < SEAL_PH_MIN || latest.ph > SEAL_PH_MAX) {
    return {
      ok: false,
      reason: `Floor reads pH ${latest.ph}. Rinse or neutralise until it reads ${SEAL_PH_MIN}–${SEAL_PH_MAX}.`,
    };
  }
  return { ok: true };
}

export type ChemistryCheck = { ok: true } | { ok: false; reason: string };

export function checkSolutionPh(
  floorType: FloorType,
  solutionPh: number,
  purpose: "clean" | "strip",
): ChemistryCheck {
  const sop = getFloorSop(floorType);
  if (!Number.isFinite(solutionPh) || solutionPh < 0 || solutionPh > 14) {
    return { ok: false, reason: "pH must be a number from 0 to 14." };
  }
  if (purpose === "strip") {
    if (sop.stripPhMax === null) {
      return { ok: false, reason: "This floor type is not stripped. Maintain it instead." };
    }
    if (solutionPh > sop.stripPhMax) {
      return { ok: false, reason: `Stripper pH ${solutionPh} exceeds the ${sop.stripPhMax} limit for this floor.` };
    }
    if (solutionPh < sop.cleanPh.min) {
      return { ok: false, reason: `Acidic product (pH ${solutionPh}) is not safe on this floor.` };
    }
    return { ok: true };
  }
  if (solutionPh < sop.cleanPh.min || solutionPh > sop.cleanPh.max) {
    return {
      ok: false,
      reason: `Cleaner pH ${solutionPh} is outside the safe window ${sop.cleanPh.min}–${sop.cleanPh.max}.`,
    };
  }
  return { ok: true };
}
