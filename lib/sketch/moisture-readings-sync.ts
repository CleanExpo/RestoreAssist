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
 *   - dryStandardMet = false, targetMc = null — pin rows are captured readings,
 *     NOT dry-standard verdicts.
 *   - sketchRoomId ← resolveEvidenceRoomLink(x,y) when rooms are provided, so
 *     moisture pins bind to RoomPlan / hand-drawn SketchRoom rows like evidence.
 */

import { resolveEvidenceRoomLink } from "./sync-room-graph";

export interface MoisturePinLike {
  wme?: number;
  material?: string;
  note?: string;
  x?: number;
  y?: number;
  sketchRoomId?: string | null;
}

export interface PinMoistureReadingInput {
  sketchId: string;
  currentMc: number;
  source: "pin";
  materialId: null;
  elementId: null;
  sketchRoomId: string | null;
  targetMc: null;
  waterCategory: null;
  dryStandardMet: false;
}

export function pinsToMoistureReadingInputs(
  sketchId: string,
  pins: unknown,
  rooms?: Array<{
    id: string;
    name?: string | null;
    fabricObjectId?: string | null;
    geometryJson: unknown;
  }>,
): PinMoistureReadingInput[] {
  if (!Array.isArray(pins)) return [];
  const out: PinMoistureReadingInput[] = [];
  for (const pin of pins) {
    const p = pin as MoisturePinLike;
    const wme = p?.wme;
    if (typeof wme !== "number" || Number.isNaN(wme)) continue;

    let sketchRoomId: string | null =
      typeof p.sketchRoomId === "string" ? p.sketchRoomId : null;
    if (
      !sketchRoomId &&
      rooms?.length &&
      typeof p.x === "number" &&
      typeof p.y === "number"
    ) {
      sketchRoomId =
        resolveEvidenceRoomLink(rooms, p.x, p.y)?.sketchRoomId ?? null;
    }

    out.push({
      sketchId,
      currentMc: wme,
      source: "pin",
      materialId: null,
      elementId: null,
      sketchRoomId,
      targetMc: null,
      waterCategory: null,
      dryStandardMet: false,
    });
  }
  return out;
}
