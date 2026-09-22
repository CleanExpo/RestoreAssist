/**
 * Geometry audit run from the sketch editor's onModified handler.
 *
 * Label, material and water-category edits fire object:modified without
 * moving the room. Those must not append a geometry correction. A real
 * move or resize still records one.
 */
import { recordAiSuggestedGeometryCorrection } from "./ai-suggested-confirm";
import { recordRoomPlanGeometryCorrection } from "./roomplan-correction";

export function applyRoomModifiedGeometry(
  data: Record<string, unknown>,
  next: {
    points: { x: number; y: number }[];
    areaM2: number;
  },
): Record<string, unknown> | null {
  if (data.captureAdapter === "roomplan") {
    return recordRoomPlanGeometryCorrection(data, next);
  }
  if (data.provenance === "ai_suggested") {
    return recordAiSuggestedGeometryCorrection(data, next);
  }
  return null;
}
