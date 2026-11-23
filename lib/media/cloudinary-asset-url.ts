/**
 * Resolve MediaAsset.storagePath (Cloudinary public_id OR full URL)
 * into a deliverable CDN URL. Used by Media Library thumbs and SEO embeds.
 */

import { cloudinaryUrl } from "@/lib/help/cloudinary";

export function cloudName(): string | null {
  if (process.env.CLOUDINARY_CLOUD_NAME?.trim()) {
    return process.env.CLOUDINARY_CLOUD_NAME.trim();
  }
  const fromUrl = process.env.CLOUDINARY_URL?.match(
    /cloudinary:\/\/[^@]+@(.+)$/,
  )?.[1];
  return fromUrl?.trim() || null;
}

/** True when path is already an absolute http(s) URL. */
export function isAbsoluteMediaUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

/**
 * RA-8350: the only hosts an absolute media path may point at. The storage
 * routes redirect a signed-in user to whatever this module resolves, so an
 * absolute URL is a redirect target and must be allow-listed, never
 * deny-listed. Older MediaAsset rows hold a Cloudinary secure_url; every
 * other provider stores a relative ID.
 */
export const ALLOWED_MEDIA_HOSTS: readonly string[] = ["res.cloudinary.com"];

/**
 * True when `path` is an absolute http(s) URL on an allow-listed media host,
 * with no credentials and no non-default port.
 */
export function isAllowedMediaUrl(path: string): boolean {
  if (!isAbsoluteMediaUrl(path)) return false;
  let parsed: URL;
  try {
    parsed = new URL(path);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port) return false;
  return ALLOWED_MEDIA_HOSTS.includes(parsed.hostname.toLowerCase());
}

/**
 * Build a Cloudinary delivery URL for a stored path/public_id.
 * Returns null when Cloudinary is not configured and path is not absolute,
 * and when an absolute path is not on an allow-listed media host.
 */
export function resolveMediaDeliveryUrl(
  storagePath: string,
  opts: { width?: number; height?: number; quality?: "auto" | number } = {},
): string | null {
  if (!storagePath?.trim()) return null;

  if (isAbsoluteMediaUrl(storagePath)) {
    if (!isAllowedMediaUrl(storagePath)) return null;
    // Already a full URL (often Cloudinary secure_url). For thumbs, try to
    // inject a transform segment when it's a standard Cloudinary upload URL.
    if (opts.width || opts.height) {
      const transformed = injectCloudinaryTransform(storagePath, opts);
      if (transformed) return transformed;
    }
    return storagePath;
  }

  const cloud = cloudName();
  if (!cloud) return null;

  try {
    return cloudinaryUrl(storagePath.replace(/^\/+/, ""), {
      cloudName: cloud,
      width: opts.width,
      height: opts.height,
      quality: opts.quality ?? "auto",
      format: "auto",
    });
  } catch {
    return null;
  }
}

/** Insert w_/h_/q_ transforms into a Cloudinary /image/upload/ URL. */
export function injectCloudinaryTransform(
  url: string,
  opts: { width?: number; height?: number; quality?: "auto" | number },
): string | null {
  const match = url.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:([^/]+)\/)?(.+)$/i,
  );
  if (!match) return null;
  const [, prefix, existingTx, rest] = match;
  // If transforms already present and look like transforms (contain _), keep and prepend size
  const parts: string[] = [];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.quality !== undefined) parts.push(`q_${opts.quality}`);
  parts.push("f_auto");
  const tx = parts.join(",");
  // Drop existing transform segment if it looks like one (contains underscore flags)
  const keepRest =
    existingTx && !/^[a-z0-9_,.]+$/i.test(existingTx)
      ? `${existingTx}/${rest}`
      : existingTx && existingTx.includes("_")
        ? rest
        : existingTx
          ? `${existingTx}/${rest}`
          : rest;
  return `${prefix}${tx}/${keepRest}`;
}
