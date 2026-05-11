/**
 * RA-2975 — Bright Data scraping provider adapter.
 *
 * Bright Data's Web Unlocker is proxy-based, not a single REST endpoint, so
 * this adapter uses their newer Scraping API (synchronous unblock endpoint).
 *
 * POST https://api.brightdata.com/request
 * Auth: Bearer ${API_KEY}
 * Body: { zone: "<zone-name>", url, format: "raw" }
 *
 * The "zone" maps to a Bright Data product (typically "web_unlocker1" for
 * residential bot-bypass). Zone name is stored in the optional encrypted
 * config on the ScrapingProviderConnection — if absent we use the
 * documented Bright Data default `unblocker`.
 *
 * Docs: https://docs.brightdata.com/api-reference/web-unlocker/
 *
 * NOTE: Not integration-tested; first BYOK customer is the first signal.
 * If the zone is wrong, this adapter throws and the dispatcher falls back
 * to SHARED + records lastError on the connection row.
 */

const BRIGHTDATA_ENDPOINT = "https://api.brightdata.com/request";
const BRIGHTDATA_TIMEOUT_MS = 45_000;
const BRIGHTDATA_DEFAULT_ZONE = "unblocker";

export async function fetchViaBrightData(
  targetUrl: string,
  apiKey: string,
  config: { zone?: string } | null,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  const zone = config?.zone ?? BRIGHTDATA_DEFAULT_ZONE;

  const res = await fetch(BRIGHTDATA_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zone,
      url: targetUrl,
      format: "raw",
    }),
    signal: signal ?? AbortSignal.timeout(BRIGHTDATA_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Bright Data request failed: HTTP ${res.status}`);
  }

  // `format: "raw"` returns the upstream HTML body directly
  const html = await res.text();
  if (!html) {
    throw new Error("Bright Data returned empty body");
  }

  return { html, status: 200 };
}
