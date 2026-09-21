/**
 * RA-6761 / RA-7611 — provenance guard at the Fabric-blob boundary.
 *
 * The estimate/scope quantity paths parse the raw Fabric `sketchData` blob.
 * Only `operator_measured` objects may contribute billed/scoped quantities.
 * `underlay_reference` (imported plan / pending LiDAR) and `ai_suggested`
 * (Vision / cloud AI) stay out until a technician confirms them.
 *
 * This is an allow-list. Untagged objects are no longer kept here; changing
 * decompose-elements.ts to stop defaulting missing tags to operator_measured
 * is a separate decision (see RA-7611 PR body).
 */

import { isOperatorMeasuredProvenance } from "./measured-provenance";

interface SketchObject {
  data?: { provenance?: string; [k: string]: unknown };
  [k: string]: unknown;
}

interface SketchBlob {
  objects?: SketchObject[];
  [k: string]: unknown;
}

export function measuredSketchData<T extends SketchBlob | null | undefined>(
  sketchData: T,
): T {
  if (!sketchData || !Array.isArray(sketchData.objects)) return sketchData;
  return {
    ...sketchData,
    objects: sketchData.objects.filter((o) =>
      isOperatorMeasuredProvenance(o?.data?.provenance),
    ),
  };
}

/**
 * Sanitize an export `floors[]` payload (RA-6761 pt 2): strip underlay_reference
 * geometry from each floor's Fabric blob so the PDF + scope generators compute
 * room areas and the compliance annex from technician-measured geometry only.
 * Non-geometry fields (label, pngDataUrl, …) pass through untouched.
 */
export function measuredFloors<
  T extends { fabricJson?: Record<string, unknown> | null },
>(floors: T[]): T[] {
  return floors.map((f) =>
    f.fabricJson
      ? {
          ...f,
          fabricJson: measuredSketchData(f.fabricJson as SketchBlob) as Record<
            string,
            unknown
          >,
        }
      : f,
  );
}

/**
 * Server-authoritative export floors (RA-6761 residual). Compliance/quantity
 * geometry comes from the server-saved ClaimSketch (keyed by floor label), not
 * from client-supplied `fabricJson` — a client can't inflate or fabricate areas.
 * Falls back to the provenance-sanitised client blob only when there is no saved
 * floor for that label (e.g. a brand-new unsaved floor). Either source is run
 * through `measuredSketchData`, so only operator_measured geometry counts.
 * Non-geometry fields (label, pngDataUrl, …) pass through untouched.
 */
export function serverAuthoritativeFloors<
  T extends { label?: string; fabricJson?: Record<string, unknown> | null },
>(
  clientFloors: T[],
  serverSketches: Array<{
    floorLabel?: string | null;
    sketchData?: Record<string, unknown> | null;
  }>,
): T[] {
  const byLabel = new Map<string, Record<string, unknown> | null | undefined>();
  for (const s of serverSketches) {
    if (s.floorLabel) byLabel.set(s.floorLabel, s.sketchData ?? null);
  }
  return clientFloors.map((f) => {
    const serverSketch = f.label ? byLabel.get(f.label) : undefined;
    const source = serverSketch ?? f.fabricJson;
    if (!source) return f;
    return {
      ...f,
      fabricJson: measuredSketchData(source as SketchBlob) as Record<
        string,
        unknown
      >,
    };
  });
}
