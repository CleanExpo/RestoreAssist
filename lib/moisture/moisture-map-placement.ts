/**
 * RA-7713 part 12 — moisture-map placement for the job page.
 *
 * Positions live on MoistureReading.mapX / mapY (normalised 0-1). The job
 * page mounted MoistureMappingCanvas with neither the saved positions nor a
 * way to save one, so every reading stayed "unplaced" and the map was empty.
 */

import {
  fromNormalizedMoistureMapPoint,
} from "@/lib/nir-moisture-map-coordinates";

export interface MapPosition {
  mapX: number;
  mapY: number;
}

interface PlaceableReading {
  id: string;
  mapX?: number | null;
  mapY?: number | null;
}

/** Canvas points for the readings that already have a saved position. */
export function pointsFromReadings<R extends PlaceableReading>(
  readings: readonly R[],
): { id: string; x: number; y: number; reading: R }[] {
  return readings
    .filter(
      (r) =>
        typeof r.mapX === "number" &&
        Number.isFinite(r.mapX) &&
        typeof r.mapY === "number" &&
        Number.isFinite(r.mapY),
    )
    .map((r) => ({
      id: r.id,
      ...fromNormalizedMoistureMapPoint({
        mapX: r.mapX as number,
        mapY: r.mapY as number,
      }),
      reading: r,
    }));
}

/** PATCH the position; throws with the server's message when it fails. */
export async function saveReadingPlacement(
  inspectionId: string,
  readingId: string,
  position: MapPosition,
): Promise<void> {
  const res = await fetch(
    `/api/inspections/${inspectionId}/moisture/${readingId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapX: position.mapX, mapY: position.mapY }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    const message =
      typeof body.error === "string"
        ? body.error
        : (body.error?.message ?? `HTTP ${res.status}`);
    throw new Error(message);
  }
}
