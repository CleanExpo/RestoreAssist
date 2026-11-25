import { BRAND } from "@/lib/brand";

/**
 * RA-8473: the link-preview picture is a static 1200x630 JPEG (a real job
 * photo with the RestoreAssist logo composited in post), served from
 * public/og. The `v` query busts crawler caches when the picture changes.
 */
export const OG_SHARE_PATH = "/og/restoreassist-share.jpg?v=20261120";
export const OG_SHARE_TYPE = "image/jpeg";

export const ogAlt = `${BRAND.name}: a restoration technician recording moisture readings on a water-damaged home`;
export const ogSize = { width: 1200, height: 630 } as const;
/**
 * The one share image every public page uses. A page-level `openGraph`
 * replaces the root object wholesale, so pages must spread this in rather
 * than rely on inheritance or restate a logo URL.
 */
export const OG_SHARE_IMAGE = {
  url: OG_SHARE_PATH,
  width: ogSize.width,
  height: ogSize.height,
  alt: ogAlt,
  type: OG_SHARE_TYPE,
};

/** Content type of the generated text card (app/opengraph-image.tsx, /og route). */
export const ogContentType = "image/png";
