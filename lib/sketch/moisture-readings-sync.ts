/**
 * RA-6763 pt2 — derive normalized SketchMoistureReading rows from the sketch's
 * moisture overlay pins, so the pins live as queryable drying-log rows (not just
 * JSON on ClaimSketch.moisturePoints).
 *
 * These rows carry `source: "pin"` and are kept entirely separate from the
 * technician-entered `source: "manual"` readings (the validated S500 log): the
 * save-time sync only ever deletes/recreates the `pin` rows.
 *
 * Field mapping + deliberate limits:
 *   - currentMc ← pin.wme. A pin's reading IS the captured field moisture value.
 *     (Assumption flagged for domain review: if WME and %MC diverge for a given
 *     material, this is the raw captured number, not a converted %MC.)
 *   - dryStandardMet = false, targetMc = null — pin rows are captured readings,
 *     NOT dry-standard verdicts. Verdicts stay with the manual readings route,
 *     so a pin can never assert an unproven S500 "dry" claim.
 *   - materialId / elementId = null — a pin's `material` is a MaterialTypeId, not
 *     a Material.id; spatial element linkage is a separate concern. ("where
 *     available" per the spec — null when not.)
 */

export interface MoisturePinLike {
  wme?: number;
  material?: string;
  note?: string;
}

export interface PinMoistureReadingInput {
  sketchId: string;
  currentMc: number;
  source: "pin";
  materialId: null;
  elementId: null;
  targetMc: null;
  waterCategory: null;
  dryStandardMet: false;
}

export function pinsToMoistureReadingInputs(
  sketchId: string,
  pins: unknown,
): PinMoistureReadingInput[] {
  if (!Array.isArray(pins)) return [];
  const out: PinMoistureReadingInput[] = [];
  for (const pin of pins) {
    const wme = (pin as MoisturePinLike)?.wme;
    // Skip pins without a usable numeric reading — a row with no currentMc would
    // be meaningless in the drying log.
    if (typeof wme !== "number" || Number.isNaN(wme)) continue;
    out.push({
      sketchId,
      currentMc: wme,
      source: "pin",
      materialId: null,
      elementId: null,
      targetMc: null,
      waterCategory: null,
      dryStandardMet: false,
    });
  }
  return out;
}
