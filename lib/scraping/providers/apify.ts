/**
 * RA-2975 — Apify scraping provider adapter.
 *
 * Uses Apify's generic `apify/cheerio-scraper` actor in sync mode to fetch
 * a target URL through Apify infrastructure. Returns HTML so the existing
 * OnTheHouse / domain.com.au parsers (lib/property-data-parser.ts) stay
 * authoritative.
 *
 * Sync endpoint:
 *   POST /v2/acts/{actorId}/run-sync-get-dataset-items?token=${KEY}
 *
 * Docs: https://docs.apify.com/api/v2#tag/Actor-runs/operation/act_runSyncGetDatasetItems
 *
 * Not integration-tested. First customer to configure APIFY BYOK is the
 * first real-world signal — if their dataset shape doesn't match expectation,
 * the route falls back to SHARED via the dispatcher's fail-safe.
 */

const APIFY_API_BASE = "https://api.apify.com";
const APIFY_ACTOR_ID = "apify~cheerio-scraper";
const APIFY_TIMEOUT_MS = 60_000;

interface ApifyDatasetItem {
  url?: string;
  body?: string;
  html?: string;
  statusCode?: number;
  "#error"?: string;
}

export async function fetchViaApify(
  targetUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  const endpoint = `${APIFY_API_BASE}/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(apiKey)}`;

  const input = {
    startUrls: [{ url: targetUrl }],
    keepUrlFragments: false,
    ignoreSslErrors: false,
    additionalMimeTypes: [],
    proxyConfiguration: { useApifyProxy: true },
    // cheerio-scraper's pageFunction lets us return body + statusCode
    pageFunction: `async function pageFunction(context) {
      const { request, response, body } = context;
      return { url: request.url, body: body.toString('utf-8'), statusCode: response.statusCode };
    }`,
    maxRequestRetries: 1,
    maxConcurrency: 1,
  };

  const timeout = setTimeout(() => {
    // Signal will be aborted by parent if external; otherwise we just let fetch's
    // own timeout (none) hold. The 60s ceiling matches Apify sync default.
  }, APIFY_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: signal ?? AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Apify run failed: HTTP ${res.status}`);
    }

    const items = (await res.json()) as ApifyDatasetItem[];
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Apify returned empty dataset");
    }

    const first = items[0];
    if (first["#error"]) {
      throw new Error(`Apify item error: ${first["#error"]}`);
    }

    const html = first.body ?? first.html ?? "";
    if (!html) {
      throw new Error("Apify item missing body/html");
    }

    return { html, status: first.statusCode ?? 200 };
  } finally {
    clearTimeout(timeout);
  }
}
