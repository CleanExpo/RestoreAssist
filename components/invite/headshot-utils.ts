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
 *
 * Primary path uses `createImageBitmap`. On headless Chromium some tiny
 * fixtures (e.g. 1×1 JPEGs used in E2E tests) cause `createImageBitmap` to
 * reject; in that case we fall back to the wider-compatible `<img>` +
 * `canvas.drawImage` path via `URL.createObjectURL`.
 */
export async function squareCropToDataUrl(
  file: File,
  outputSize = 512,
): Promise<string> {
  try {
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
  } catch {
    return await cropViaImageElement(file, outputSize);
  }
}

function cropViaImageElement(file: File, outputSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        const side = Math.min(img.width, img.height) || 1;
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, outputSize, outputSize);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error("Failed to crop image"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });
}
