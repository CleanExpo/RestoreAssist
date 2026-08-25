/**
 * Hardened listing-scrape helpers (SSRF / injection / DoS).
 *
 * Host allowlist + redirect-safe fetch live here so scrape callers share one
 * validation path for listing URLs, redirects, and embedded media URLs.
 */

export const ALLOWED_SCRAPE_HOSTS: ReadonlySet<string> = new Set([
  "www.onthehouse.com.au",
  "onthehouse.com.au",
  "www.domain.com.au",
  "domain.com.au",
  "www.realestate.com.au",
  "realestate.com.au",
]);

export const SCRAPE_LIMITS = {
  MAX_SCRAPE_URL_LENGTH: 2048,
  MAX_ADDRESS_LENGTH: 200,
  MAX_POSTCODE_LENGTH: 12,
  MAX_HTML_BYTES: 2_500_000,
  MAX_REQUEST_BODY_BYTES: 16_384,
  MAX_CANDIDATES: 8,
  MAX_IMAGES: 24,
} as const;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Label for cache / UI when a listing host is known. */
export function scrapeHostLabel(
  url: string,
): "onthehouse" | "domain" | "realestate" | "unknown" {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "onthehouse.com.au") return "onthehouse";
    if (host === "domain.com.au") return "domain";
    if (host === "realestate.com.au") return "realestate";
  } catch {
    /* ignore */
  }
  return "unknown";
}

/** True for IPv4 / IPv6 hostnames we must never fetch. */
export function isIpLiteralHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(":")) return true;
  return false;
}

/**
 * Normalize + validate a listing page URL for outbound scrape.
 * Returns a canonical https URL string, or null if unsafe / disallowed.
 */
export function normalizeScrapeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > SCRAPE_LIMITS.MAX_SCRAPE_URL_LENGTH) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;
  if (isIpLiteralHostname(parsed.hostname)) return null;
  if (/[^\x00-\x7f]/.test(parsed.hostname)) return null;
  if (!ALLOWED_SCRAPE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

/** True when the URL is https on an allowlisted scrape host (hardened). */
export function isAllowedScrapeUrl(url: string): boolean {
  return normalizeScrapeUrl(url) !== null;
}

/** Allow only https image URLs that cannot be used as SSRF bait. */
export function sanitizeScrapedImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > SCRAPE_LIMITS.MAX_SCRAPE_URL_LENGTH) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (/^(javascript|data|blob|file|vbscript):/i.test(trimmed)) return null;

  let parsed: URL;
  try {
    const withProto = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    parsed = new URL(withProto);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;
  if (isIpLiteralHostname(parsed.hostname)) return null;

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal") ||
    host === "169.254.169.254"
  ) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString();
}

export function sanitizeScrapedImageList(
  urls: unknown,
  max = SCRAPE_LIMITS.MAX_IMAGES,
): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const clean = sanitizeScrapedImageUrl(u);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeScrapedPropertyMedia<
  T extends {
    floorPlanImages?: string[];
    propertyImages?: string[];
  },
>(data: T): T {
  return {
    ...data,
    floorPlanImages: sanitizeScrapedImageList(data.floorPlanImages ?? []),
    propertyImages: sanitizeScrapedImageList(data.propertyImages ?? []),
  };
}

export function clampAddress(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.slice(0, SCRAPE_LIMITS.MAX_ADDRESS_LENGTH);
}

export function clampPostcode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (!/^\d{4}$/.test(t) && !/^[A-Za-z0-9][A-Za-z0-9\s-]{0,10}[A-Za-z0-9]$/.test(t)) {
    return undefined;
  }
  return t.slice(0, SCRAPE_LIMITS.MAX_POSTCODE_LENGTH);
}

const ALLOWED_FALLBACK = new Set(["domain", "realestate", "onthehouse"]);

export function sanitizeFallbackSources(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase();
    if (!ALLOWED_FALLBACK.has(key)) continue;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export function isRequestBodyTooLarge(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.length > SCRAPE_LIMITS.MAX_REQUEST_BODY_BYTES;
}

export function clampHtmlPayload(html: string): string {
  if (html.length <= SCRAPE_LIMITS.MAX_HTML_BYTES) return html;
  return html.slice(0, SCRAPE_LIMITS.MAX_HTML_BYTES);
}

/**
 * Fetch with manual redirect handling: follows at most ONE redirect, and only
 * when the resolved Location is https on an allowlisted scrape host. Throws
 * on a disallowed or missing Location, and on a second redirect hop.
 */
export async function fetchWithValidatedRedirect(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const safeUrl = normalizeScrapeUrl(url);
  if (!safeUrl) {
    throw new Error(`[safe-fetch] refusing disallowed start URL: ${url}`);
  }

  const first = await fetch(safeUrl, { ...init, redirect: "manual" });
  if (!REDIRECT_STATUSES.has(first.status)) {
    return first;
  }

  const location = first.headers.get("location");
  if (!location) {
    throw new Error(`[safe-fetch] redirect from ${safeUrl} without a Location`);
  }

  const target = normalizeScrapeUrl(new URL(location, safeUrl).toString());
  if (!target) {
    throw new Error(
      `[safe-fetch] refusing redirect to disallowed target: ${location}`,
    );
  }

  const second = await fetch(target, { ...init, redirect: "manual" });
  if (REDIRECT_STATUSES.has(second.status)) {
    throw new Error(
      `[safe-fetch] refusing to follow a second redirect from ${target}`,
    );
  }
  return second;
}
