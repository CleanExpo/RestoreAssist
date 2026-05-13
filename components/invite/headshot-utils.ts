const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"] as const;

export type HeadshotValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateHeadshotFile(file: File): HeadshotValidationResult {
  if (!file || file.size === 0) {
    return { ok: false, error: "Photo must be a JPG or PNG under 5MB" };
  }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return { ok: false, error: "Photo must be a JPG or PNG under 5MB" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Photo must be a JPG or PNG under 5MB" };
  }
  return { ok: true };
}

/**
 * Square-crop the largest centred square of an image and return as a JPEG
 * data URL. Used client-side before posting to the server so the upload
 * payload is bounded and the headshot is already in the canonical aspect.
 *
 * Browser-only — relies on HTMLCanvasElement.
 */
export async function squareCropToDataUrl(
  file: File,
  outputSize = 512,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outputSize, outputSize);
  return canvas.toDataURL("image/jpeg", 0.9);
}
