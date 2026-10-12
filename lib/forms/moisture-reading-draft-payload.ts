/**
 * NIR moisture-reading draft-snapshot payload (RA-7610).
 *
 * The payload sends sketchRoomId so a link made on the job (or by the
 * owner-run backfill) is not reset to null, and the reading's id so draft save
 * updates a loaded reading in place instead of recreating it (B23).
 */
export interface NirMoistureReadingDraftEntry {
  id?: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  sketchRoomId?: string | null;
  isBaseline?: boolean;
  isMonitoringPoint?: boolean;
}

export function buildMoistureReadingDraftPayload(
  reading: NirMoistureReadingDraftEntry,
  mapPoint: { mapX: number | null; mapY: number | null } | null,
) {
  return {
    ...(reading.id && { id: reading.id }),
    location: reading.location,
    surfaceType: reading.surfaceType,
    moistureLevel: reading.moistureLevel,
    depth: reading.depth,
    mapX: mapPoint?.mapX ?? null,
    mapY: mapPoint?.mapY ?? null,
    sketchRoomId: reading.sketchRoomId ?? null,
    isBaseline: reading.isBaseline === true,
    isMonitoringPoint: reading.isMonitoringPoint === true,
  };
}
