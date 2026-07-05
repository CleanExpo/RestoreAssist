import type { SketchFloor } from "@/lib/generate-sketch-pdf";
import { parseMoisturePins } from "@/lib/reports/moisture-map";

/**
 * The subset of a `ClaimSketch` row needed to build a report floor page.
 * `renderedPngUrl` is the client-rasterised floor (underlay + annotations)
 * stored in the `sketch-media/exports` bucket.
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
        const res = await fetchImpl(s.renderedPngUrl);
        if (!res.ok) return null;
        const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
        return {
          label: s.floorLabel,
          pngDataUrl: `data:image/png;base64,${base64}`,
          fabricJson:
            s.sketchData && typeof s.sketchData === "object"
              ? (s.sketchData as Record<string, unknown>)
              : null,
          moisturePins: parseMoisturePins(s.moisturePoints),
        };
      } catch {
        return null;
      }
    }),
  );

  return floors.filter((f): f is SketchFloor => f !== null);
}
