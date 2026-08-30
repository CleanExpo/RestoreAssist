import "server-only";

import { createHash } from "node:crypto";
import { isSafePublicHttpsUrl } from "@/lib/security/safe-external-url";
import { sanitizeScrapedImageUrl } from "@/lib/scraping/safe-fetch";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const MAX_SERVER_UNDERLAY_BYTES = 10 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS = 1;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export interface PreparedUnderlay {
  bytes: Buffer;
  mimeType: "image/png";
  contentSha256: string;
  sourceSizeBytes: number;
}

export interface StoredUnderlay {
  signedUrl: string;
  storagePath: string;
  created: boolean;
}

function detectedMime(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

function assertAllowedImage(
  bytes: Uint8Array,
  declaredMime?: string | null,
): void {
  if (!bytes.length || bytes.length > MAX_SERVER_UNDERLAY_BYTES) {
    throw new Error("Floor-plan image must be between 1 byte and 10 MB.");
  }
  const magicMime = detectedMime(bytes);
  if (
    !magicMime ||
    (declaredMime && !ALLOWED_MIME.has(declaredMime.split(";")[0].trim()))
  ) {
    throw new Error("Floor-plan image must be a PNG, JPEG or WebP file.");
  }
}

async function responseBytes(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SERVER_UNDERLAY_BYTES
  ) {
    throw new Error("Floor-plan image exceeds the 10 MB limit.");
  }
  if (!response.body)
    throw new Error("The selected listing image returned no data.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_SERVER_UNDERLAY_BYTES) {
      await reader.cancel();
      throw new Error("Floor-plan image exceeds the 10 MB limit.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
  assertAllowedImage(bytes, response.headers.get("content-type"));
  return bytes;
}

/**
 * Fetch a listing image with the same fail-closed public-host rules used by
 * other server-side media readers. Redirects are manual and revalidated.
 */
export async function fetchRemoteUnderlay(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  let current = sanitizeScrapedImageUrl(rawUrl);
  if (!current || !(await isSafePublicHttpsUrl(current))) {
    throw new Error(
      "The selected listing image is not eligible for secure retrieval.",
    );
  }

  for (let hop = 0; hop <= MAX_REMOTE_REDIRECTS; hop++) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if (!REDIRECTS.has(response.status)) {
      if (!response.ok)
        throw new Error("The selected listing image could not be retrieved.");
      return responseBytes(response);
    }
    if (hop === MAX_REMOTE_REDIRECTS) {
      throw new Error("The selected listing image redirected too many times.");
    }
    const location = response.headers.get("location");
    if (!location)
      throw new Error(
        "The selected listing image returned an invalid redirect.",
      );
    const next = sanitizeScrapedImageUrl(new URL(location, current).toString());
    if (!next || !(await isSafePublicHttpsUrl(next))) {
      throw new Error(
        "The selected listing image redirected to an unsafe location.",
      );
    }
    current = next;
  }
  throw new Error("The selected listing image could not be retrieved.");
}

function watermarkSvg(width: number, height: number): Buffer {
  const tile = 300;
  const fontSize = Math.max(18, Math.round(Math.min(width, height) / 24));
  const labels: string[] = [];
  for (let y = -tile; y <= height + tile; y += tile) {
    for (let x = -tile; x <= width + tile; x += tile) {
      labels.push(
        `<text x="${x}" y="${y}" transform="rotate(-35 ${x} ${y})" ` +
          `fill="rgba(220,38,38,0.20)" font-family="sans-serif" ` +
          `font-size="${fontSize}" font-weight="700" text-anchor="middle">REFERENCE ONLY</text>`,
      );
    }
  }
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels.join("")}</svg>`,
  );
}

/** Normalize every source to a watermarked PNG, then hash the exact stored bytes. */
export async function prepareUnderlayBytes(
  source: Uint8Array,
  declaredMime?: string | null,
): Promise<PreparedUnderlay> {
  assertAllowedImage(source, declaredMime);
  const sourceSizeBytes = source.byteLength;
  const sharp = (await import("sharp")).default;
  const pipeline = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
  const meta = await pipeline.metadata();
  if (
    !meta.width ||
    !meta.height ||
    meta.width > 10_000 ||
    meta.height > 10_000
  ) {
    throw new Error("Floor-plan image dimensions are not supported.");
  }
  const bytes = await pipeline
    .composite([
      { input: watermarkSvg(meta.width, meta.height), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (bytes.length > MAX_SERVER_UNDERLAY_BYTES) {
    throw new Error("Prepared floor-plan image exceeds the 10 MB limit.");
  }
  return {
    bytes,
    mimeType: "image/png",
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    sourceSizeBytes,
  };
}

export async function storeUnderlay(
  inspectionId: string,
  floorNumber: number,
  prepared: PreparedUnderlay,
): Promise<StoredUnderlay> {
  const supabase = getSupabaseServerClient();
  const storagePath = `inspections/${inspectionId}/underlays/floor-${floorNumber}-${prepared.contentSha256}.png`;
  const bucket = supabase.storage.from("sketch-media");
  const { error } = await bucket.upload(storagePath, prepared.bytes, {
    contentType: prepared.mimeType,
    upsert: false,
  });
  const alreadyExists = Boolean(
    error && /already exists|duplicate/i.test(error.message),
  );
  if (error && !alreadyExists) {
    throw new Error(`Floor-plan storage failed: ${error.message}`);
  }
  const signed = await bucket.createSignedUrl(storagePath, 3600);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error("Floor-plan preview could not be signed.");
  }
  return {
    signedUrl: signed.data.signedUrl,
    storagePath,
    created: !alreadyExists,
  };
}

export async function removeStoredUnderlay(storagePath: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.storage.from("sketch-media").remove([storagePath]);
}
