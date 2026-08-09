import type { SketchFloor } from "@/lib/generate-sketch-pdf";
import { parseMoisturePins } from "@/lib/reports/moisture-map";
import { parseEvidencePins } from "@/lib/reports/evidence-map";
import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";
import { isSafePublicHttpsUrl } from "@/lib/security/safe-external-url";

/**
 * The subset of a `ClaimSketch` row needed to build a report floor page.
 * `renderedPngUrl` is the client-rasterised floor (underlay + annotations)
 * stored in the `sketch-media/exports` bucket.
 */
export interface ClaimSketchRow {
  inspectionId?: string;
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

export interface ReportFloorPlanStatus {
  label: string;
  source: "rendered_sketch" | "uploaded_floor_plan";
  status: "included" | "unavailable";
  reason?: string;
}

export interface ReportFloorPlanOutput {
  status: ReportFloorPlanStatus;
  floor: SketchFloor | null;
}

const NO_RENDER_REASON =
  "No rendered floor-plan image was available at report generation time.";
const RETRIEVAL_REASON =
  "The stored floor-plan image could not be retrieved at report generation time.";
const UPLOAD_RETRIEVAL_REASON =
  "The uploaded floor-plan image could not be retrieved at report generation time.";

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
  const output = await claimSketchesToFloorPlanOutput(sketches, fetchImpl);
  return output.flatMap(({ floor }) => (floor ? [floor] : []));
}

/**
 * Resolve every persisted sketch to both its optional renderable floor and an
 * explicit report status. Unlike {@link claimSketchesToFloors}, this keeps rows
 * whose render is missing or unreadable so canonical PDFs can disclose the
 * named omission instead of silently dropping it.
 */
export async function claimSketchesToFloorPlanOutput(
  sketches: ClaimSketchRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<ReportFloorPlanOutput[]> {
  const sorted = [...sketches].sort((a, b) => a.floorNumber - b.floorNumber);

  return Promise.all(
    sorted.map(async (s): Promise<ReportFloorPlanOutput> => {
      const unavailable: ReportFloorPlanStatus = {
        label: s.floorLabel,
        source: "rendered_sketch",
        status: "unavailable",
      };

      if (!s.renderedPngUrl) {
        return {
          status: { ...unavailable, reason: NO_RENDER_REASON },
          floor: null,
        };
      }

      try {
        // P0-1: sketch-media is private; re-sign the stored URL before fetching
        // its bytes for PDF embedding. Non-storage URLs pass through unchanged.
        const signedUrl = await signStoredMediaUrl(s.renderedPngUrl, {
          expectedBucket: "sketch-media",
          requiredPathPrefix: s.inspectionId
            ? `inspections/${s.inspectionId}/`
            : "missing-authorised-inspection/",
        });
        if (!signedUrl) {
          return {
            status: { ...unavailable, reason: RETRIEVAL_REASON },
            floor: null,
          };
        }
        if (!(await isSafePublicHttpsUrl(signedUrl))) {
          return {
            status: { ...unavailable, reason: RETRIEVAL_REASON },
            floor: null,
          };
        }
        const res = await fetchImpl(signedUrl, { redirect: "error" });
        if (!res.ok) {
          return {
            status: { ...unavailable, reason: RETRIEVAL_REASON },
            floor: null,
          };
        }
        const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
        return {
          status: { ...unavailable, status: "included" },
          floor: {
            label: s.floorLabel,
            pngDataUrl: `data:image/png;base64,${base64}`,
            fabricJson:
              s.sketchData && typeof s.sketchData === "object"
                ? (s.sketchData as Record<string, unknown>)
                : null,
            moisturePins: parseMoisturePins(s.moisturePoints),
            evidencePins: parseEvidencePins(s.evidencePins),
          },
        };
      } catch {
        return {
          status: { ...unavailable, reason: RETRIEVAL_REASON },
          floor: null,
        };
      }
    }),
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
  const output = await uploadedFloorPlanToOutput(floorPlanImageUrl, fetchImpl);
  return output?.floor ?? null;
}

/** Keep an explicitly supplied but unreadable uploaded plan visible in reports. */
export async function uploadedFloorPlanToOutput(
  floorPlanImageUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ReportFloorPlanOutput | null> {
  if (!floorPlanImageUrl) return null;
  const unavailable: ReportFloorPlanStatus = {
    label: "Uploaded Floor Plan",
    source: "uploaded_floor_plan",
    status: "unavailable",
  };
  try {
    const res = await fetchImpl(floorPlanImageUrl);
    if (!res.ok) {
      return {
        status: { ...unavailable, reason: UPLOAD_RETRIEVAL_REASON },
        floor: null,
      };
    }
    const contentType = res.headers.get("content-type") || "image/png";
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return {
      status: { ...unavailable, status: "included" },
      floor: {
        label: "Uploaded Floor Plan",
        pngDataUrl: `data:${contentType};base64,${base64}`,
        fabricJson: null,
        moisturePins: null,
        evidencePins: null,
      },
    };
  } catch {
    return {
      status: { ...unavailable, reason: UPLOAD_RETRIEVAL_REASON },
      floor: null,
    };
  }
}
