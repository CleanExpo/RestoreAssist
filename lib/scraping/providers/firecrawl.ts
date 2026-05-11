/**
 * RA-2975 — Firecrawl scraping provider adapter.
 *
 * POST https://api.firecrawl.dev/v1/scrape  with  { url, formats: ["html"] }
 * Auth: Bearer ${API_KEY}
 *
 * Docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape
 */

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const FIRECRAWL_TIMEOUT_MS = 45_000;

interface FirecrawlResponse {
  success?: boolean;
  data?: {
    html?: string;
    rawHtml?: string;
    metadata?: {
      statusCode?: number;
      sourceURL?: string;
    };
  };
  error?: string;
}

export async function fetchViaFirecrawl(
  targetUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  const res = await fetch(FIRECRAWL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: targetUrl,
      formats: ["html"],
    }),
    signal: signal ?? AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as FirecrawlResponse;
  if (data.success === false) {
    throw new Error(`Firecrawl error: ${data.error ?? "unknown"}`);
  }

  const html = data.data?.html ?? data.data?.rawHtml ?? "";
  if (!html) {
    throw new Error("Firecrawl response missing html");
  }

  return { html, status: data.data?.metadata?.statusCode ?? 200 };
}
