/**
 * Server-only image compression pipeline using Sharp.
 * Pure functions — no I/O. Import only in API routes or server lib.
 */

import { createHash } from "crypto";

export interface CompressionResult {
  compressed: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  originalSizeBytes: number;
}

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/heic",
  "image/heif",
]);

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Compress an image buffer using Sharp.
 * - Compressed: 80% JPEG quality, max 2048px longest edge (for dashboard viewing)
 * - Thumbnail: 400px longest edge (for list views and evidence grids)
 *
 * The original buffer is NOT modified — it is stored as-is for
 * chain-of-custody legal requirements.
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string,
): Promise<CompressionResult> {
  // Dynamic import — sharp is a native module, keep it server-only
  const sharp = (await import("sharp")).default;

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const compressed = await sharp(buffer)
    .resize(2048, 2048, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();

  const thumbnail = await sharp(buffer)
    .resize(400, 400, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75, progressive: true })
    .toBuffer();

  return {
    compressed,
    thumbnail,
    width,
    height,
    originalSizeBytes: buffer.byteLength,
  };
}

/**
 * Compute SHA-256 hash of a buffer for chain-of-custody metadata.
 * Always computed on the original (uncompressed) buffer.
 */
export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Derive the file extension for an optimised variant.
 * All image variants are stored as JPEG for consistency.
 */
export function getOptimisedExtension(_mimeType: string): string {
  return "jpg";
}

/**
 * Determine the resource type for classification heuristics.
 */
export function classifyByMimeType(
  mimeType: string,
): "image" | "video" | "document" | "other" {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (
    m === "application/pdf" ||
    m.includes("document") ||
    m.includes("spreadsheet")
  )
    return "document";
  return "other";
}
