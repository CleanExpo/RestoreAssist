/**
 * Platform / BYOK Apify adapter for listing floor-plan fetch.
 *
 * Domain.com.au uses `dz_omar/domain-scraper` (limited permissions, structured
 * media including floor plans). Other allowlisted hosts use
 * `apify/website-content-crawler` for HTML. cheerio-scraper is not used —
 * it requires a one-time "full account access" approval that fails 403.
 *
 * Sync endpoint:
 *   POST /v2/acts/{actorId}/run-sync-get-dataset-items
 * Auth: Authorization Bearer (never put the token in logs).
 */

import {
  domainListingToHtml,
  domainSearchToHtml,
  isDomainHost,
  isDomainPropertyListingUrl,
  type DomainActorItem,
} from "./apify-domain-map";

const APIFY_API_BASE = "https://api.apify.com";
const APIFY_TIMEOUT_MS = 120_000;
const DOMAIN_ACTOR_ID = "dz_omar~domain-scraper";
const HTML_ACTOR_ID = "apify~website-content-crawler";

/**
 * Platform-level Apify token for listing floor-plan fetch.
 * Prefer `APIFY_API_TOKEN` (Apify console name). `APIFY_API_KEY` is an alias.
 * Workspace BYOK still wins when a connection is configured.
 */
export function resolveApifyToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const token = env.APIFY_API_TOKEN?.trim() || env.APIFY_API_KEY?.trim();
  return token ? token : null;
}

interface ApifyErrorBody {
  error?: {
    type?: string;
    message?: string;
    data?: { approvalUrl?: string };
  };
}

export function describeApifyHttpError(
  status: number,
  body: ApifyErrorBody | null,
): Error {
  const type = body?.error?.type;
  if (status === 401) {
    return new Error("Apify rejected the API token");
  }
  if (status === 403 && type === "full-permission-actor-not-approved") {
    return new Error(
      "Apify actor needs permission approval in the Apify console",
    );
  }
  if (status === 403) {
    return new Error("Apify rejected the API token");
  }
  if (status === 402) {
    return new Error("Apify account is out of credits");
  }
  return new Error(`Apify run failed: HTTP ${status}`);
}

async function runActorSync<T>(
  actorId: string,
  apiKey: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T[]> {
  const endpoint = `${APIFY_API_BASE}/v2/acts/${actorId}/run-sync-get-dataset-items`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: signal ?? AbortSignal.timeout(APIFY_TIMEOUT_MS),
  });

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw describeApifyHttpError(
      res.status,
      parsed && typeof parsed === "object" ? (parsed as ApifyErrorBody) : null,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Apify returned empty dataset");
  }
  return parsed as T[];
}

function isUnusableHtml(html: string, httpStatus?: number): boolean {
  if (!html || html.length < 200) return true;
  if (httpStatus && httpStatus >= 400) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes("access denied") ||
    lower.includes("just a moment") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("cf-challenge")
  );
}

async function fetchDomainListingHtml(
  targetUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  const listing = isDomainPropertyListingUrl(targetUrl);
  const items = await runActorSync<DomainActorItem>(
    DOMAIN_ACTOR_ID,
    apiKey,
    {
      start_urls: [{ url: targetUrl }],
      maxResults: listing ? 1 : 8,
      detailMode: listing,
    },
    signal,
  );
  if (listing) {
    if (items.length === 0) {
      throw new Error("Apify returned empty dataset");
    }
    return { html: domainListingToHtml(items[0] ?? {}, targetUrl), status: 200 };
  }
  return { html: domainSearchToHtml(items), status: 200 };
}

async function fetchHtmlViaWebsiteCrawler(
  targetUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  const items = await runActorSync<{
    html?: string;
    crawl?: { httpStatusCode?: number };
  }>(
    HTML_ACTOR_ID,
    apiKey,
    {
      startUrls: [{ url: targetUrl }],
      maxCrawlPages: 1,
      maxCrawlDepth: 0,
      crawlerType: "cheerio",
      saveHtml: true,
      saveMarkdown: false,
      saveFiles: false,
      saveScreenshots: false,
      proxyConfiguration: { useApifyProxy: true },
    },
    signal,
  );
  const first = items[0] ?? {};
  const html = typeof first.html === "string" ? first.html : "";
  const httpStatus = first.crawl?.httpStatusCode;
  if (isUnusableHtml(html, httpStatus)) {
    throw new Error("Apify could not load a usable listing page");
  }
  return { html, status: httpStatus && httpStatus < 400 ? httpStatus : 200 };
}

export async function fetchViaApify(
  targetUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  if (isDomainHost(targetUrl)) {
    return fetchDomainListingHtml(targetUrl, apiKey, signal);
  }
  return fetchHtmlViaWebsiteCrawler(targetUrl, apiKey, signal);
}
