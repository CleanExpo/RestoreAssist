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

export interface SignStoredMediaUrlOptions {
  expectedBucket?: string;
  requiredPathPrefix?: string;
}

type ParsedStorageUrl =
  | { kind: "external" }
  | { kind: "invalid" }
  | { kind: "storage"; origin: string; ref: StorageRef };

const STORAGE_PATH_PREFIX = "/storage/v1/object/";

function rawUrlPath(url: string): string | null {
  const schemeEnd = url.indexOf("://");
  if (schemeEnd < 0) return null;
  const pathStart = url.indexOf("/", schemeEnd + 3);
  if (pathStart < 0) return "";
  return url.slice(pathStart).split(/[?#]/, 1)[0];
}

function fullyDecodePath(value: string): string | null {
  let decoded = value;
  for (let depth = 0; depth < 8; depth++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  // Excessively nested encoding is not a legitimate storage object path.
  return null;
}

function isSafeStoragePath(path: string): boolean {
  if (!path || path.includes("\\")) return false;
  return path
    .split("/")
    .every((segment) => segment !== "." && segment !== "..");
}

function parseStorageUrl(url: string): ParsedStorageUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.includes(STORAGE_PATH_PREFIX)
      ? { kind: "invalid" }
      : { kind: "external" };
  }

  if (!parsed.pathname.startsWith(STORAGE_PATH_PREFIX)) {
    return { kind: "external" };
  }

  const rawPath = rawUrlPath(url);
  if (!rawPath?.startsWith(STORAGE_PATH_PREFIX)) return { kind: "invalid" };
  const match = rawPath.match(/^\/storage\/v1\/object\/(?:public|sign)\/(.+)$/);
  if (!match) return { kind: "invalid" };

  const decoded = fullyDecodePath(match[1]);
  if (!decoded || !isSafeStoragePath(decoded)) return { kind: "invalid" };
  const firstSlash = decoded.indexOf("/");
  if (firstSlash <= 0) return { kind: "invalid" };
  const bucket = decoded.slice(0, firstSlash);
  const path = decoded.slice(firstSlash + 1);
  if (!bucket || !isSafeStoragePath(path)) return { kind: "invalid" };

  return {
    kind: "storage",
    origin: parsed.origin,
    ref: { bucket, path },
  };
}

function configuredSupabaseOrigin(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return null;
  try {
    return new URL(configuredUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Parse a structurally valid Supabase storage URL into { bucket, path }. Handles
 * both the public form (`/storage/v1/object/public/<bucket>/<path>`) and the
 * signed form (`/storage/v1/object/sign/<bucket>/<path>?token=…`). Returns null
 * for malformed or unsafe paths. Pure — no I/O, unit-testable.
 */
export function parseSupabaseStorageUrl(url: string): StorageRef | null {
  if (!url) return null;
  const parsed = parseStorageUrl(url);
  return parsed.kind === "storage" ? parsed.ref : null;
}

/**
 * Return a fresh signed URL for private media on the configured Supabase origin.
 * External/legacy hosts pass through. Storage-shaped URLs fail closed when their
 * origin, canonical path, caller constraints, or signing operation is invalid.
 */
export async function signStoredMediaUrl(
  url: string | null | undefined,
  options: SignStoredMediaUrlOptions = {},
): Promise<string | null | undefined> {
  if (!url) return url;
  const parsed = parseStorageUrl(url);
  if (parsed.kind === "external") return url;
  if (parsed.kind === "invalid") return null;

  const configuredOrigin = configuredSupabaseOrigin();
  if (!configuredOrigin || parsed.origin !== configuredOrigin) return null;

  const { ref } = parsed;
  if (!PRIVATE_BUCKETS.has(ref.bucket)) {
    return options.expectedBucket ? null : url;
  }
  if (options.expectedBucket && ref.bucket !== options.expectedBucket)
    return null;
  if (
    options.requiredPathPrefix &&
    (!isSafeStoragePath(options.requiredPathPrefix) ||
      !ref.path.startsWith(options.requiredPathPrefix))
  ) {
    return null;
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
