/**
 * NIR moisture-reading draft-snapshot payload (RA-7610).
 *
 * Draft save deletes and recreates every MoistureReading. The payload must
 * send sketchRoomId so a link made on the job (or by the owner-run backfill)
 * is not reset to null.
 */
export interface NirMoistureReadingDraftEntry {
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  sketchRoomId?: string | null;
}

export function buildMoistureReadingDraftPayload(
  reading: NirMoistureReadingDraftEntry,
  mapPoint: { mapX: number | null; mapY: number | null } | null,
) {
  return {
    location: reading.location,
    surfaceType: reading.surfaceType,
    moistureLevel: reading.moistureLevel,
    depth: reading.depth,
    mapX: mapPoint?.mapX ?? null,
    mapY: mapPoint?.mapY ?? null,
    sketchRoomId: reading.sketchRoomId ?? null,
  };
}
