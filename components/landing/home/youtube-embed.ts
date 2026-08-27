/**
 * Hardened YouTube helpers for marketing embeds.
 *
 * Only an 11-character YouTube id may reach a URL. Anything else — slashes,
 * schemes, query strings — is rejected so an iframe cannot be pointed at
 * a host other than youtube-nocookie / i.ytimg.
 */

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function isSafeYoutubeId(id: string): boolean {
  return YOUTUBE_ID_PATTERN.test(id);
}

export function youtubeNocookieEmbedSrc(id: string): string | null {
  if (!isSafeYoutubeId(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export function youtubeThumbnailSrc(
  id: string,
  quality: "maxresdefault" | "hqdefault",
): string | null {
  if (!isSafeYoutubeId(id)) return null;
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}
