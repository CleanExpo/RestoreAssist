/**
 * Hardened YouTube helpers for marketing embeds.
 *
 * Only an 11-character YouTube id may reach a URL. Query params are built
 * with URLSearchParams. The parent origin is allowlisted so a poisoned
 * NEXT_PUBLIC_SITE_URL cannot be forwarded to YouTube as `origin`.
 */

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const EMBED_HOST = "https://www.youtube-nocookie.com";
const THUMB_HOST = "https://i.ytimg.com";
const FALLBACK_ORIGIN = "https://restoreassist.app";

const ALLOWED_EMBED_ORIGINS = new Set([
  "https://restoreassist.app",
  "https://www.restoreassist.app",
  "http://localhost:3000",
  "http://localhost:3001",
]);

export function isSafeYoutubeId(id: string): boolean {
  return YOUTUBE_ID_PATTERN.test(id);
}

/** Parent origin sent to YouTube. Unknown or non-http(s) values are dropped. */
export function resolveEmbedOrigin(
  raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  if (!raw?.trim()) return FALLBACK_ORIGIN;
  try {
    const origin = new URL(raw).origin;
    return ALLOWED_EMBED_ORIGINS.has(origin) ? origin : FALLBACK_ORIGIN;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

export function youtubeNocookieEmbedSrc(
  id: string,
  origin: string = resolveEmbedOrigin(),
): string | null {
  if (!isSafeYoutubeId(id)) return null;
  const parent = ALLOWED_EMBED_ORIGINS.has(origin) ? origin : FALLBACK_ORIGIN;
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    enablejsapi: "0",
    origin: parent,
  });
  return `${EMBED_HOST}/embed/${encodeURIComponent(id)}?${params.toString()}`;
}

export function youtubeThumbnailSrc(
  id: string,
  quality: "maxresdefault" | "hqdefault",
): string | null {
  if (!isSafeYoutubeId(id)) return null;
  return `${THUMB_HOST}/vi/${encodeURIComponent(id)}/${quality}.jpg`;
}
