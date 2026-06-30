/**
 * Resolve a selected floor-plan underlay image to a persistable URL.
 *
 * Manual uploads arrive as base64 `data:` URLs. Inlining those into the sketch
 * row (and therefore the report PDF) bloats the database and payload, so they are
 * converted to a Blob and uploaded to storage, returning the hosted public URL.
 * Images that are already hosted (http/https — e.g. scraped listing floor plans)
 * are returned unchanged.
 *
 * Dependencies are injected so the resolver is unit-testable without Supabase.
 */
export interface PersistUnderlayDeps {
  /** Convert a `data:` URL into an uploadable Blob (e.g. `dataUrlToBlob`). */
  toBlob: (dataUrl: string) => Blob;
  /** Upload the Blob and return its public URL (e.g. `uploadFloorPlanUnderlay`). */
  upload: (blob: Blob, inspectionId: string) => Promise<{ publicUrl: string }>;
}

export async function persistUnderlayImage(
  selectedImage: string,
  inspectionId: string | undefined,
  deps: PersistUnderlayDeps,
): Promise<string> {
  // Not a manual upload (already hosted), or no inspection to upload under:
  // nothing to persist — return the reference unchanged.
  if (!selectedImage.startsWith("data:") || !inspectionId) {
    return selectedImage;
  }
  const blob = deps.toBlob(selectedImage);
  const { publicUrl } = await deps.upload(blob, inspectionId);
  return publicUrl;
}
