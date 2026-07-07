/**
 * NIR affected-area submission payload (RA-7001).
 *
 * The technician form stores each affected area's size in its
 * `affectedSquareFootage` state field, but that field is a misnomer: it holds
 * the area in **m²** (length × width in metres, rendered as "m²" in the UI).
 *
 * The /affected-areas route treats a bare `affectedSquareFootage` as square feet
 * and converts it (×0.09290304), which shrinks a genuine m² value ~10.76×. To
 * keep new rows correct we submit the value under the canonical `affectedAreaSqm`
 * key; the route then derives the deprecated sq-ft column via sqmToSqft for the
 * sq-ft-native IICRC classification engine.
 */
export interface NirAffectedAreaEntry {
  roomZoneId: string;
  /** Misnomer: holds the area in m² (see module note). */
  affectedSquareFootage: number;
  waterSource: string;
  timeSinceLoss: number;
  length: number;
  width: number;
  height: number;
  materials: string[];
}

export function buildAffectedAreaPayload(area: NirAffectedAreaEntry) {
  return {
    roomZoneId: area.roomZoneId,
    affectedAreaSqm: area.affectedSquareFootage,
    waterSource: area.waterSource,
    timeSinceLoss: area.timeSinceLoss,
    length: area.length,
    width: area.width,
    height: area.height,
    materials: area.materials,
    description: `Dimensions: ${area.length}m × ${area.width}m × ${area.height}m. Materials: ${area.materials.join(", ")}`,
  };
}
