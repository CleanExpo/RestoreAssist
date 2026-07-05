/**
 * Client-side image compression before evidence upload (RA-1610, sequel to
 * the RA-1124 offline sync queue).
 *
 * Downscales to a 2048px long edge and re-encodes to WebP at 80% quality
 * before a photo enters the offline evidence queue (lib/evidence-upload-queue.ts)
 * — cuts upload bandwidth on the slow/intermittent site connections field
 * techs work under.
 *
 * Browser-only — relies on `createImageBitmap` + `OffscreenCanvas`, falling
 * back to `HTMLCanvasElement` when OffscreenCanvas is unavailable (Safari <
 * 16.4, some WebViews).
 *
 * Chain-of-custody note (rule 21): `computeSha256()` in lib/capture/cocoa-client.ts
 * must run over the bytes returned by this module, not the original camera
 * bytes — the server only verifies whatever bytes it receives (`route.ts`
 * re-hashes the multipart body), so hashing post-compression keeps the
 * custody chain intact. Hashing pre-compression would make every upload fail
 * the server's mismatch check.
 *
 * Deliberately hand-rolls the (tiny) EXIF-orientation read instead of using
 * the `exifr` package already in this repo (lib/media/exif-extract.ts) —
 * that package runs server-side only; pulling it into the client bundle here
 * would work against the bandwidth savings this module exists to deliver.
 */

const LONG_EDGE_MAX = 2048;
const WEBP_QUALITY = 0.8;
const SKIP_MAX_BYTES = 500 * 1024;
const WEBP_MIME = "image/webp";

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  /** MIME type of the returned blob. */
  format: string;
  /** True when the input was returned unchanged (already small WebP, non-image, or undecodable). */
  skipped: boolean;
}

/**
 * Compress an image blob for upload. Never throws — any decode/encode
 * failure falls back to returning the original blob with `skipped: true`.
 */
export async function compressImageForUpload(
  file: Blob,
): Promise<CompressionResult> {
  const originalSize = file.size;
  const originalType = file.type || "application/octet-stream";

  const original: CompressionResult = {
    blob: file,
    originalSize,
    compressedSize: originalSize,
    format: originalType,
    skipped: true,
  };

  if (originalType === WEBP_MIME && originalSize < SKIP_MAX_BYTES) {
    return original;
  }

  if (!originalType.startsWith("image/")) {
    return original;
  }

  let bitmap: ImageBitmap;
  try {
    // `imageOrientation: "none"` keeps decode raw-pixel — we apply the EXIF
    // rotation ourselves below so the transform is explicit and testable.
    bitmap = await createImageBitmap(file, { imageOrientation: "none" });
  } catch {
    // Browser can't decode this format (e.g. HEIC on non-Safari) — ship the
    // original rather than throwing, so the upload still proceeds.
    return original;
  }

  try {
    const orientation = await readExifOrientation(file);
    const blob = await renderToWebp(bitmap, orientation);
    bitmap.close();

    if (!blob || blob.size === 0) {
      return original;
    }

    return {
      blob,
      originalSize,
      compressedSize: blob.size,
      format: WEBP_MIME,
      skipped: false,
    };
  } catch {
    bitmap.close();
    return original;
  }
}

// ─── CANVAS RENDER ────────────────────────────────────────────────────────────

async function renderToWebp(
  bitmap: ImageBitmap,
  orientation: number,
): Promise<Blob | null> {
  const { canvasWidth, canvasHeight, drawWidth, drawHeight } = scaledDims(
    bitmap.width,
    bitmap.height,
    orientation,
  );

  const { canvas, ctx } = createCanvas(canvasWidth, canvasHeight);
  applyOrientationTransform(ctx, orientation, drawWidth, drawHeight);
  ctx.drawImage(bitmap, 0, 0, drawWidth, drawHeight);

  return encodeToWebp(canvas);
}

/**
 * Computes the canvas size and the (pre-rotation) drawn image size. For
 * orientations 5-8 (a 90-degree rotation) the canvas is swapped relative to
 * the source bitmap's raw width/height.
 */
function scaledDims(
  sourceWidth: number,
  sourceHeight: number,
  orientation: number,
) {
  const rawLongEdge = Math.max(sourceWidth, sourceHeight);
  const scale = rawLongEdge > LONG_EDGE_MAX ? LONG_EDGE_MAX / rawLongEdge : 1;
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const swapped = orientation >= 5 && orientation <= 8;

  return {
    canvasWidth: swapped ? drawHeight : drawWidth,
    canvasHeight: swapped ? drawWidth : drawHeight,
    drawWidth,
    drawHeight,
  };
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createCanvas(
  width: number,
  height: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Canvas2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) return { canvas, ctx };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return { canvas, ctx };
}

/** Standard EXIF-orientation → canvas-transform matrix (values 2-8; 1 = no-op). */
function applyOrientationTransform(
  ctx: Canvas2D,
  orientation: number,
  drawWidth: number,
  drawHeight: number,
): void {
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, drawWidth, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, drawWidth, drawHeight);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, drawHeight);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, drawHeight, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, drawHeight, drawWidth);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, drawWidth);
      break;
    default:
      break; // 1 = normal, no transform needed
  }
}

async function encodeToWebp(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): Promise<Blob | null> {
  if (typeof (canvas as OffscreenCanvas).convertToBlob === "function") {
    return (canvas as OffscreenCanvas).convertToBlob({
      type: WEBP_MIME,
      quality: WEBP_QUALITY,
    });
  }

  return new Promise((resolve) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => resolve(b),
      WEBP_MIME,
      WEBP_QUALITY,
    );
  });
}

// ─── EXIF ORIENTATION ─────────────────────────────────────────────────────────

/**
 * Reads the EXIF `Orientation` tag (1-8) from a JPEG's APP1 segment. Returns
 * 1 (normal) for non-JPEGs, missing EXIF, or any parse failure — orientation
 * is a rendering nicety, never worth failing the upload over.
 */
export async function readExifOrientation(file: Blob): Promise<number> {
  try {
    // The EXIF segment lives in the first few KB for virtually all camera
    // JPEGs — avoids reading a multi-MB file just for one tag.
    const head = await file.slice(0, 65536).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
      return 1;
    }

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if ((marker & 0xff00) !== 0xff00) break; // fell out of the marker stream
      if (marker === 0xffda) break; // start of scan — no more metadata markers

      const segmentLength = view.getUint16(offset, false);
      if (marker === 0xffe1) {
        const exifStart = offset + 2;
        if (
          exifStart + 6 <= view.byteLength &&
          view.getUint32(exifStart, false) === 0x45786966 // "Exif"
        ) {
          return parseTiffOrientation(view, exifStart + 6);
        }
        return 1;
      }
      offset += segmentLength;
    }
  } catch {
    // fall through to default
  }
  return 1;
}

function parseTiffOrientation(view: DataView, tiffStart: number): number {
  if (tiffStart + 8 > view.byteLength) return 1;
  const little = view.getUint16(tiffStart, false) === 0x4949;
  const firstIfdOffset = view.getUint32(tiffStart + 4, little);
  const ifdStart = tiffStart + firstIfdOffset;
  if (ifdStart + 2 > view.byteLength) return 1;

  const entryCount = view.getUint16(ifdStart, little);
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdStart + 2 + i * 12;
    if (entryOffset + 10 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, little);
    if (tag === 0x0112) {
      const value = view.getUint16(entryOffset + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
