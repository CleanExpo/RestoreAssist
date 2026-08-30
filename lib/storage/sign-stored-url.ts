/**
 * Re-sign a stored Supabase storage URL at read time (P0-1).
 *
 * The evidence-optimised and sketch-media buckets are private, so a URL stored
 * on a record (InspectionPhoto.url, EvidenceItem.fileUrl, …) is either a bare
 * public URL from before the buckets were privatised or a signed URL that has
 * since expired — both fail to load. This module extracts the bucket + object
 * path from any Supabase storage URL and mints a fresh short-lived signed URL.
 *
 * URLs that are not Supabase storage URLs (legacy Cloudinary/S3, data URIs,
 * empty) pass through unchanged.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

const SIGNED_URL_TTL_SECONDS = 3600;

// Buckets whose objects must be served via signed URLs. Public/legacy hosts and
// any other bucket pass through untouched.
const PRIVATE_BUCKETS = new Set([
  "evidence-optimised",
  "evidence-originals",
  "sketch-media",
]);

export interface StorageRef {
  bucket: string;
  path: string;
}

export function toStorageLocator(ref: StorageRef): string {
  return `storage://${ref.bucket}/${ref.path}`;
}

export function inspectionStorageRef(
  url: string,
  inspectionId: string,
  folder: "underlays" | "exports" | "photos",
): StorageRef | null {
  const ref = parseSupabaseStorageUrl(url);
  if (!ref || ref.bucket !== "sketch-media") return null;
  const expectedPrefix = `inspections/${inspectionId}/${folder}/`;
  return ref.path.startsWith(expectedPrefix) ? ref : null;
}

/**
 * Parse a Supabase storage URL into { bucket, path }. Handles both the public
 * form (`/storage/v1/object/public/<bucket>/<path>`) and the signed form
 * (`/storage/v1/object/sign/<bucket>/<path>?token=…`). Returns null for any URL
 * that is not a Supabase storage object URL. Pure — no I/O, unit-testable.
 */
export function parseSupabaseStorageUrl(
  url: string,
  expectedOrigin: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): StorageRef | null {
  if (!url) return null;
  if (url.startsWith("storage://")) {
    const locator = url.slice("storage://".length);
    const slash = locator.indexOf("/");
    if (slash <= 0) return null;
    const bucket = locator.slice(0, slash);
    const path = locator.slice(slash + 1);
    return bucket && path ? { bucket, path } : null;
  }

  let parsed: URL;
  let trustedOrigin: URL;
  try {
    parsed = new URL(url);
    if (!expectedOrigin) return null;
    trustedOrigin = new URL(expectedOrigin);
  } catch {
    return null;
  }
  if (parsed.origin !== trustedOrigin.origin) return null;
  const marker = parsed.pathname.match(
    /\/storage\/v1\/object\/(?:public|sign)\/(.+)$/,
  );
  if (!marker) return null;
  const firstSlash = marker[1].indexOf("/");
  if (firstSlash <= 0) return null;
  const bucket = marker[1].slice(0, firstSlash);
  const path = marker[1].slice(firstSlash + 1);
  if (!bucket || !path) return null;
  return { bucket, path: decodeURIComponent(path) };
}

/**
 * Return a fresh signed URL for a stored media URL that points at a private
 * bucket; return the input unchanged for public/legacy hosts or unparseable
 * input. Never throws for a bad URL — a broken link must not break a list read.
 */
export async function signStoredMediaUrl(
  url: string | null | undefined,
): Promise<string | null | undefined> {
  if (!url) return url;
  const ref = parseSupabaseStorageUrl(url);
  if (!ref || !PRIVATE_BUCKETS.has(ref.bucket)) return url;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}
