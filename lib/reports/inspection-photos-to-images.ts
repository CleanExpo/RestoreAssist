/**
 * The subset of an `InspectionPhoto` row needed to embed it in a report.
 */
export interface InspectionPhotoRow {
  url: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  location?: string | null;
  roomType?: string | null;
  mimeType?: string | null;
}

/** A fetched, ready-to-embed report photo. */
export interface ReportPhoto {
  bytes: Uint8Array;
  /** true → embed with embedPng; false → embedJpg. Sniffed from the bytes. */
  isPng: boolean;
  /** Caption text (may be ""). */
  caption: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function looksLikePng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function captionOf(p: InspectionPhotoRow): string {
  return (
    p.description?.trim() ||
    p.location?.trim() ||
    p.roomType?.trim() ||
    ""
  );
}

/**
 * Convert persisted `InspectionPhoto` rows into ready-to-embed report photos
 * (RA-120 / PR3). Each photo is fetched (preferring `thumbnailUrl` so the
 * embedded bytes stay bounded — avoids report bloat) and its format is sniffed
 * from the bytes so the embed path picks embedPng vs embedJpg correctly,
 * regardless of a stale `mimeType`.
 *
 * A photo with no usable URL, or whose image fails to fetch, is skipped — a
 * broken photo must never block the report download. `fetchImpl` is injectable
 * for testing.
 */
export async function inspectionPhotosToImages(
  photos: InspectionPhotoRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<ReportPhoto[]> {
  const results = await Promise.all(
    photos.map(async (p): Promise<ReportPhoto | null> => {
      const src = p.thumbnailUrl?.trim() || p.url?.trim();
      if (!src) return null;
      try {
        const res = await fetchImpl(src);
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length === 0) return null;
        return { bytes, isPng: looksLikePng(bytes), caption: captionOf(p) };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((r): r is ReportPhoto => r !== null);
}
