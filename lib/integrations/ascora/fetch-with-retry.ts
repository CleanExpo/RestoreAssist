/**
 * RA-273 — Ascora HTTP fetch wrapped with retry-with-exponential-backoff.
 *
 * Reuses the shared lib/integrations/retry.ts util (the same one Xero/QBO/MYOB
 * invoice syncing goes through via sync-queue.ts) rather than a bespoke
 * implementation. Retries transient failures only (network errors, 5xx, 429)
 * — terminal 4xx errors are not retried. Honours a 429's Retry-After header.
 *
 * Used by both the OAuth-based client (lib/integrations/ascora/client.ts,
 * the generic dashboard "Sync" pipeline) and the historical-import route
 * (app/api/ascora/sync/route.ts, API-key based).
 */

import {
  retryWithExponentialBackoff,
  parseRetryAfterMs,
  DEFAULT_RETRY_OPTIONS,
  type RetryOptions,
} from "../retry";
import {
  isAscoraTimeoutError,
  isAscoraTlsError,
} from "./upstream-errors";

export interface AscoraApiError extends Error {
  status: number;
  retryAfterMs?: number;
}

export interface FetchAscoraOptions {
  /** AbortSignal.timeout() budget for each individual attempt. */
  timeoutMs?: number;
  /** Retry knobs — defaults to the shared DEFAULT_RETRY_OPTIONS. */
  retryOptions?: RetryOptions;
  /** Extra context (endpoint/page) folded into the thrown error message. */
  context?: string;
}

function asAscoraApiError(
  message: string,
  status: number,
  name?: string,
): AscoraApiError {
  const err = new Error(message) as AscoraApiError;
  err.status = status;
  if (name) err.name = name;
  return err;
}

/**
 * Fetch `url`, retrying transient failures with exponential backoff. Resolves
 * with the raw (already `.ok`) Response on success. Throws an AscoraApiError
 * — carrying `status` and, when present, `retryAfterMs` — once retries are
 * exhausted or the failure is non-retryable (e.g. 400/401/404).
 */
export async function fetchAscoraWithRetry(
  url: string,
  init: RequestInit,
  options: FetchAscoraOptions = {},
): Promise<Response> {
  const { timeoutMs = 15000, retryOptions = DEFAULT_RETRY_OPTIONS, context } =
    options;

  return retryWithExponentialBackoff(async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isAscoraTlsError(err)) {
        throw asAscoraApiError(
          context
            ? `Ascora TLS failure on ${context}`
            : "Ascora TLS certificate validation failed",
          502,
          "AscoraTlsError",
        );
      }
      if (isAscoraTimeoutError(err)) {
        throw asAscoraApiError(
          context
            ? `Ascora request timed out on ${context} after ${timeoutMs}ms`
            : `Ascora request timed out after ${timeoutMs}ms`,
          504,
          "TimeoutError",
        );
      }
      throw err;
    }

    if (!response.ok) {
      const body = await response.text();
      const message = context
        ? `Ascora API ${response.status} on ${context}: ${body.slice(0, 300)}`
        : `Ascora API ${response.status}: ${body.slice(0, 300)}`;
      const err = asAscoraApiError(message, response.status);
      const retryAfterMs = parseRetryAfterMs(response);
      if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
      throw err;
    }

    return response;
  }, { ...retryOptions, respectRetryAfter: true });
}
