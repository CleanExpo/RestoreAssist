/**
 * RA-120 (PR4): floor-plan underlay upload validation.
 *
 * Manual underlay uploads were previously accepted with `accept="image/*"` and
 * no size cap, then inlined as base64. This guards the type (raster formats the
 * Fabric canvas + report embed can render) and the size (matches the
 * `sketch-media` bucket's 10 MB limit), so a bad file is rejected with a clear
 * message instead of silently bloating the sketch.
 */

export const ALLOWED_UNDERLAY_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_UNDERLAY_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UnderlayValidationResult {
  ok: boolean;
  error?: string;
}

export function validateUnderlayUpload(file: {
  type: string;
  size: number;
}): UnderlayValidationResult {
  if (!ALLOWED_UNDERLAY_TYPES.includes(file.type as never)) {
    return {
      ok: false,
      error: "Unsupported file type — please upload a PNG, JPG, or WebP image.",
    };
  }
  if (file.size > MAX_UNDERLAY_BYTES) {
    const mb = Math.round(MAX_UNDERLAY_BYTES / 1024 / 1024);
    return { ok: false, error: `File is too large — maximum ${mb} MB.` };
  }
  return { ok: true };
}
