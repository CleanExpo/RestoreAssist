/**
 * Image compression for offline evidence uploads — RA-1610
 *
 * Compresses images to WebP at ≤2048px long-edge before they enter the
 * IndexedDB sync queue, reducing bandwidth on reconnect.
 *
 * BROWSER ONLY — uses createImageBitmap / OffscreenCanvas (with canvas
 * fallback). All callers already guard against SSR via the queue module.
 */

const MAX_LONG_EDGE = 2048;
const WEBP_QUALITY = 0.8;
const SKIP_THRESHOLD_BYTES = 500_000; // 500 KB

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  /** true when the file was returned unchanged */
  skipped: boolean;
}

/**
 * Compress a photo File to WebP before queuing.
 *
 * Skip conditions (returns original blob):
 *  - Already WebP AND under 500 KB
 *
 * EXIF orientation: OffscreenCanvas ignores EXIF, so we read the orientation
 * tag via exifr and apply a pre-draw canvas rotation.
 */
export async function compressImageForUpload(
  file: File,
): Promise<CompressionResult> {
  const originalSize = file.size;

  // Fast path — already small WebP, nothing to do.
  if (file.type === "image/webp" && file.size < SKIP_THRESHOLD_BYTES) {
    return { blob: file, originalSize, compressedSize: originalSize, skipped: true };
  }

  // Read EXIF orientation before decoding (exifr is already a project dep).
  let exifOrientation = 1;
  try {
    // exifr's named export returns the numeric orientation (1–8) or undefined.
    const { orientation } = await import("exifr");
    const result = await orientation(file);
    if (typeof result === "number") exifOrientation = result;
  } catch {
    // exifr unavailable or file has no EXIF — treat as upright.
  }

  const bitmap = await createImageBitmap(file);
  const { naturalWidth, naturalHeight } = getDimensions(bitmap, exifOrientation);

  // Compute scaled dimensions preserving aspect ratio.
  const scale =
    Math.max(naturalWidth, naturalHeight) > MAX_LONG_EDGE
      ? MAX_LONG_EDGE / Math.max(naturalWidth, naturalHeight)
      : 1;
  const outWidth = Math.round(naturalWidth * scale);
  const outHeight = Math.round(naturalHeight * scale);

  const blob = await drawToWebP(bitmap, outWidth, outHeight, exifOrientation);
  bitmap.close();

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    skipped: false,
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * EXIF orientations 5–8 swap width/height (90° / 270° rotations).
 * Return the logical (post-rotation) dimensions so we scale correctly.
 */
function getDimensions(
  bitmap: ImageBitmap,
  orientation: number,
): { naturalWidth: number; naturalHeight: number } {
  if (orientation >= 5 && orientation <= 8) {
    return { naturalWidth: bitmap.height, naturalHeight: bitmap.width };
  }
  return { naturalWidth: bitmap.width, naturalHeight: bitmap.height };
}

/**
 * Draw the bitmap onto a canvas (with EXIF orientation correction) and
 * export as WebP. Falls back to a regular <canvas> when OffscreenCanvas
 * is not available (Firefox < 105, older Safari).
 */
async function drawToWebP(
  bitmap: ImageBitmap,
  outWidth: number,
  outHeight: number,
  orientation: number,
): Promise<Blob> {
  const useOffscreen = typeof OffscreenCanvas !== "undefined";

  // Canvas output size matches the logical (rotated) dimensions.
  const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(outWidth, outHeight)
    : document.createElement("canvas");

  if (!useOffscreen) {
    (canvas as HTMLCanvasElement).width = outWidth;
    (canvas as HTMLCanvasElement).height = outHeight;
  }

  const ctx = (canvas as OffscreenCanvas).getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;

  if (!ctx) throw new Error("Could not get 2D canvas context for compression");

  applyOrientationTransform(ctx, orientation, outWidth, outHeight);
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

  if (useOffscreen) {
    return (canvas as OffscreenCanvas).convertToBlob({
      type: "image/webp",
      quality: WEBP_QUALITY,
    });
  }

  // HTMLCanvasElement path — toBlob is callback-based.
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

/**
 * Applies canvas transforms to correct EXIF orientation before drawing.
 * Orientation values follow the EXIF 2.3 spec (1–8).
 */
function applyOrientationTransform(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
): void {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, height, width); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
    default: break; // orientation 1 — no transform needed
  }
}
