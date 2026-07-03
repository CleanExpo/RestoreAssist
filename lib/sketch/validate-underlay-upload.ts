/**
 * RA-120 (PR4): floor-plan underlay upload validation.
 *
 * Manual underlay uploads were previously accepted with `accept="image/*"` and
 * no size cap, then inlined as base64. This guards the type (raster formats the
 * Fabric canvas + report embed can render) and the size (matches the
 * `sketch-media` bucket's 10 MB limit), so a bad file is rejected with a clear
 * message instead of silently bloating the sketch.
 *
 * RA-6849 [C3]: PDF is now accepted too — the loader rasterises page 1 to a PNG
 * (see `pdf-to-raster.ts`) before it ever reaches storage/the canvas, so the raw
 * PDF only needs to pass this type/size gate.
 */

export const ALLOWED_UNDERLAY_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_UNDERLAY_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UnderlayValidationResult {
  ok: boolean;
  error?: string;
}

/** Whether the file needs the PDF → raster step before it can be embedded. */
export function isPdfUnderlay(type: string): boolean {
  return type === "application/pdf";
}

export function validateUnderlayUpload(file: {
  type: string;
  size: number;
}): UnderlayValidationResult {
  if (!ALLOWED_UNDERLAY_TYPES.includes(file.type as never)) {
    return {
      ok: false,
      error:
        "Unsupported file type — please upload a PNG, JPG, WebP image or a PDF.",
    };
  }
  if (file.size > MAX_UNDERLAY_BYTES) {
    const mb = Math.round(MAX_UNDERLAY_BYTES / 1024 / 1024);
    return { ok: false, error: `File is too large — maximum ${mb} MB.` };
  }
  return { ok: true };
}
