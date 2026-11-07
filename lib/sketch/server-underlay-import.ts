import "server-only";

import { createHash } from "node:crypto";
import { isSafePublicHttpsUrl } from "@/lib/security/safe-external-url";
import { sanitizeScrapedImageUrl } from "@/lib/scraping/safe-fetch";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  STRICT_UPLOAD_POLICY,
  detectImageMediaType,
  validateImageUploadStrict,
} from "@/lib/media/validate-image-upload";

export const MAX_SERVER_UNDERLAY_BYTES = STRICT_UPLOAD_POLICY.maxBytes;
const MAX_REMOTE_REDIRECTS = 1;
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
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

function assertAllowedImage(
  bytes: Uint8Array,
  declaredMime?: string | null,
): void {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // No declared type (internal callers): require the bytes to be self-consistent.
  const declaredType =
    declaredMime?.split(";")[0].trim() || detectImageMediaType(buffer) || "";
  const check = validateImageUploadStrict({
    declaredType,
    buffer,
    allowedTypes: ALLOWED_MIME,
  });
  if (!check.ok) {
    throw new Error(`Floor-plan image rejected: ${check.reason}.`);
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
  const pipeline = sharp(source, { limitInputPixels: STRICT_UPLOAD_POLICY.maxPixels }).rotate();
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
