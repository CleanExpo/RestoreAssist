/**
 * RA-2975 — Zyte API scraping provider adapter.
 *
 * POST https://api.zyte.com/v1/extract  with  { url, httpResponseBody: true }
 * Basic auth: username = API key, password = empty.
 *
 * Returns base64-encoded httpResponseBody — decode to UTF-8.
 *
 * Docs: https://docs.zyte.com/zyte-api/openapi.html
 */

const ZYTE_ENDPOINT = "https://api.zyte.com/v1/extract";
const ZYTE_TIMEOUT_MS = 45_000;

interface ZyteResponse {
  statusCode?: number;
  httpResponseBody?: string; // base64-encoded
  url?: string;
}

export async function fetchViaZyte(
  targetUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ html: string; status: number }> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const res = await fetch(ZYTE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: targetUrl,
      httpResponseBody: true,
    }),
    signal: signal ?? AbortSignal.timeout(ZYTE_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Zyte extract failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as ZyteResponse;
  if (!data.httpResponseBody) {
    throw new Error("Zyte response missing httpResponseBody");
  }

  // httpResponseBody is base64-encoded per Zyte spec
  const html = Buffer.from(data.httpResponseBody, "base64").toString("utf-8");

  return { html, status: data.statusCode ?? 200 };
}
