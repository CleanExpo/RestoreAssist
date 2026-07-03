/**
 * RA-6940 — redirect-validating fetch for the property scraper.
 *
 * /api/properties/scrape allowlists the REQUEST host (RA-1347) but used
 * redirect: "follow", so an allowlisted host that 302s (or is ever
 * compromised / rebound) could bounce the server-side fetch to an
 * attacker-chosen target (internal services, cloud metadata). Fetch with
 * redirect: "manual" instead, re-validate the Location host against the
 * same allowlist, and follow at most one hop.
 */

export const ALLOWED_SCRAPE_HOSTS: ReadonlySet<string> = new Set([
  "www.onthehouse.com.au",
  "onthehouse.com.au",
  "www.domain.com.au",
  "domain.com.au",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** True when the URL is https on an allowlisted scrape host. */
export function isAllowedScrapeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && ALLOWED_SCRAPE_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
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
  const first = await fetch(url, { ...init, redirect: "manual" });
  if (!REDIRECT_STATUSES.has(first.status)) {
    return first;
  }

  const location = first.headers.get("location");
  if (!location) {
    throw new Error(`[safe-fetch] redirect from ${url} without a Location`);
  }

  // Location may be relative — resolve against the original URL first.
  const target = new URL(location, url).toString();
  if (!isAllowedScrapeUrl(target)) {
    throw new Error(
      `[safe-fetch] refusing redirect to disallowed target: ${target}`,
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
