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

/**
 * Parse a Supabase storage URL into { bucket, path }. Handles both the public
 * form (`/storage/v1/object/public/<bucket>/<path>`) and the signed form
 * (`/storage/v1/object/sign/<bucket>/<path>?token=…`). Returns null for any URL
 * that is not a Supabase storage object URL. Pure — no I/O, unit-testable.
 */
export function parseSupabaseStorageUrl(url: string): StorageRef | null {
  if (!url) return null;
  const marker = url.match(/\/storage\/v1\/object\/(?:public|sign)\/(.+)$/);
  if (!marker) return null;
  // Strip any query string (signed URLs carry ?token=…) before splitting.
  const withoutQuery = marker[1].split("?")[0];
  const firstSlash = withoutQuery.indexOf("/");
  if (firstSlash <= 0) return null;
  const bucket = withoutQuery.slice(0, firstSlash);
  const path = withoutQuery.slice(firstSlash + 1);
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
