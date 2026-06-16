/**
 * RA-6761 — provenance guard at the Fabric-blob boundary.
 *
 * The estimate/scope quantity paths parse the raw Fabric `sketchData` blob.
 * AI/underlay-imported geometry carries `data.provenance = "underlay_reference"`
 * (RA-6760) and must NOT contribute to billed/scoped quantities until a
 * technician confirms it. This returns a shallow copy of the blob with those
 * objects removed, so any consumer that parses the blob only ever sees
 * technician-measured geometry. Untagged objects are technician-drawn and
 * default to operator_measured (mirrors decompose-elements), so they are kept.
 */

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
    objects: sketchData.objects.filter(
      (o) => o?.data?.provenance !== "underlay_reference",
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
