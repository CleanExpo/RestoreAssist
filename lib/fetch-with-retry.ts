/**
 * RA-1550 — 429-aware fetch wrapper.
 *
 * When the server returns 429 + `Retry-After`, this helper waits for the
 * indicated window and retries once. Everything else is passed through.
 * The intent is to make the UI resilient to the middleware-level
 * baseline rate-limit from RA-1540 without every caller having to
 * hand-roll a retry loop.
 *
 * Usage:
 *   const res = await fetchWithRetry("/api/invoices", { method: "POST", body });
 *   if (!res.ok) { ... normal error handling ... }
 *
 * For the `Retry-After` header we accept both numeric (delta seconds)
 * and HTTP-date forms per RFC 7231 §7.1.3.
 */

export interface RetryResult {
  response: Response;
  retried: boolean;
  /** Seconds the caller was asked to wait before retry (null if no header). */
  retryAfterSeconds: number | null;
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.min(numeric, 60);
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const diff = Math.ceil((date - Date.now()) / 1000);
    return diff > 0 ? Math.min(diff, 60) : 0;
  }
  return null;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<RetryResult> {
  const response = await fetch(input, init);
  if (response.status !== 429) {
    return { response, retried: false, retryAfterSeconds: null };
  }

  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  if (retryAfter == null) {
    return { response, retried: false, retryAfterSeconds: null };
  }

  // Clone the body ref for the retry — original response is consumed.
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  const retry = await fetch(input, init);
  return { response: retry, retried: true, retryAfterSeconds: retryAfter };
}

/**
 * Format a user-visible message for a 429 without retry. Caller can pass
 * straight into a toast.
 */
export function formatRateLimitMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds == null) {
    return "You're sending requests too quickly. Please wait a moment and try again.";
  }
  if (retryAfterSeconds <= 1) {
    return "Too many requests — try again in a second.";
  }
  return `Too many requests — try again in ${retryAfterSeconds} seconds.`;
}
