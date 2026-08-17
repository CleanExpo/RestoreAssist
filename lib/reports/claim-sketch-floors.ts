import type { SketchFloor } from "@/lib/generate-sketch-pdf";
import { parseMoisturePins } from "./moisture-map";
import { parseEvidencePins } from "./evidence-map";
import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";
import {
  filterNormalizedPinsInRoom,
  type RoomMoistureCropMeta,
} from "@/lib/sketch/room-moisture-crop";
import { roomMoistureCropFromStoredSketchData } from "@/lib/sketch/pending-sketch-load";

/**
 * The subset of a `ClaimSketch` row needed to build a report floor page.
 * `renderedPngUrl` is the client-rasterised floor (operator geometry only —
 * underlay stripped, content-cropped) stored in the `sketch-media/exports` bucket.
 */
export interface ClaimSketchRow {
  floorNumber: number;
  floorLabel: string;
  renderedPngUrl: string | null;
  sketchData?: unknown;
  /**
   * RA-120 §3: the client moisture-overlay pins persisted on the sketch. Not
   * baked into `renderedPngUrl` (they're a React DOM overlay), so they are
   * parsed here and overlaid onto the sketch image in the report PDF.
   */
  moisturePoints?: unknown;
  evidencePins?: unknown;
}

/**
 * When a floor has room moisture crop meta, append a room-scoped moisture page
 * (Hydro-style workflow outcome — room map for reports).
 */
export function expandFloorsWithRoomMoisture(
  floors: SketchFloor[],
): SketchFloor[] {
  const out: SketchFloor[] = [];
  for (const floor of floors) {
    out.push(floor);
    const cropMeta = floor.roomMoistureCrop;
    if (!cropMeta?.roomPoints?.length) continue;
    const w = cropMeta.canvasWidth ?? 0;
    const h = cropMeta.canvasHeight ?? 0;
    const roomPins = filterNormalizedPinsInRoom(
      floor.moisturePins ?? [],
      cropMeta.roomPoints,
      w,
      h,
    );
    const label =
      cropMeta.crop.label ??
      cropMeta.roomId ??
      "Room";
    out.push({
      ...floor,
      label: `Room moisture — ${label}`,
      moisturePins: roomPins,
      evidencePins: null,
      roomMoistureCrop: cropMeta,
      isRoomMoisturePage: true,
    });
  }
  return out;
}

/**
 * Convert persisted `ClaimSketch` rows into `SketchFloor`s for
 * {@link embedSketchesInPdf}. Only sketches with a `renderedPngUrl` are
 * included (the server cannot render the Fabric canvas itself), sorted by
 * floor. Each PNG is fetched and inlined as a data URL because
 * `dataUrlToBytes` (the embed path) only decodes `data:` URLs.
 *
 * A floor whose image fails to fetch is skipped rather than failing the whole
 * report — a missing floor plan must never block the PDF download.
 *
 * `fetchImpl` is injectable for testing.
 */
export async function claimSketchesToFloors(
  sketches: ClaimSketchRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<SketchFloor[]> {
  const renderable = sketches
    .filter((s): s is ClaimSketchRow & { renderedPngUrl: string } =>
      Boolean(s.renderedPngUrl),
    )
    .sort((a, b) => a.floorNumber - b.floorNumber);

  const floors = await Promise.all(
    renderable.map(async (s): Promise<SketchFloor | null> => {
      try {
        // P0-1: sketch-media is private; re-sign the stored URL before fetching
        // its bytes for PDF embedding. Non-storage URLs pass through unchanged.
        const signedUrl = await signStoredMediaUrl(s.renderedPngUrl);
        const res = await fetchImpl(signedUrl ?? s.renderedPngUrl);
        if (!res.ok) return null;
        const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
        const roomMoistureCrop: RoomMoistureCropMeta | null =
          roomMoistureCropFromStoredSketchData(s.sketchData);
        return {
          label: s.floorLabel,
          pngDataUrl: `data:image/png;base64,${base64}`,
          fabricJson:
            s.sketchData && typeof s.sketchData === "object"
              ? (s.sketchData as Record<string, unknown>)
              : null,
          moisturePins: parseMoisturePins(s.moisturePoints),
          evidencePins: parseEvidencePins(s.evidencePins),
          roomMoistureCrop,
        };
      } catch {
        return null;
      }
    }),
  );

  return expandFloorsWithRoomMoisture(
    floors.filter((f): f is SketchFloor => f !== null),
  );
}

/**
 * RA-7006 Gap 6: an uploaded floor-plan image (`Inspection.floorPlanImageUrl`)
 * rendered only in the on-screen viewer and never reached the PDF. This fetches
 * that image and returns it as a SketchFloor so it can be appended alongside
 * the rasterised sketches. Best-effort: a missing/broken image returns null and
 * must never block the download.
 */
export async function uploadedFloorPlanToFloor(
  floorPlanImageUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SketchFloor | null> {
  if (!floorPlanImageUrl) return null;
  try {
    const res = await fetchImpl(floorPlanImageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return {
      label: "Uploaded Floor Plan",
      pngDataUrl: `data:${contentType};base64,${base64}`,
      fabricJson: null,
      moisturePins: null,
      evidencePins: null,
    };
  } catch {
    return null;
  }
}
