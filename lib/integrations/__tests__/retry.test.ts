/**
 * RA-273 — retryWithExponentialBackoff + the respectRetryAfter extension.
 *
 * Uses tiny delays (not DEFAULT_RETRY_OPTIONS' real 1s/10s) so the suite
 * stays fast; behaviour under test is retry-vs-no-retry and delay selection,
 * not the specific production timing constants.
 */

import { describe, expect, it, vi } from "vitest";
import {
  retryWithExponentialBackoff,
  parseRetryAfterMs,
  RetryError,
  type RetryOptions,
} from "../retry";

const FAST_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1,
  maxDelay: 5,
  factor: 2,
};

function httpError(status: number, retryAfterMs?: number): Error & {
  status: number;
  retryAfterMs?: number;
} {
  const err = new Error(`HTTP ${status}`) as Error & {
    status: number;
    retryAfterMs?: number;
  };
  err.status = status;
  if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
  return err;
}

describe("retryWithExponentialBackoff", () => {
  it("retries a transient (5xx) failure and succeeds", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw httpError(503);
      return "ok";
    });

    const result = await retryWithExponentialBackoff(fn, FAST_OPTIONS);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 and succeeds", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw httpError(429);
      return "ok";
    });

    const result = await retryWithExponentialBackoff(fn, FAST_OPTIONS);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a terminal (4xx, non-429) failure", async () => {
    const fn = vi.fn(async () => {
      throw httpError(404);
    });

    await expect(retryWithExponentialBackoff(fn, FAST_OPTIONS)).rejects.toThrow(
      "HTTP 404",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws RetryError once maxRetries is exhausted on a persistent transient failure", async () => {
    const fn = vi.fn(async () => {
      throw httpError(500);
    });

    await expect(retryWithExponentialBackoff(fn, FAST_OPTIONS)).rejects.toThrow(
      RetryError,
    );
    // 1 initial attempt + 3 retries = 4 calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("honours retryAfterMs over the computed backoff when respectRetryAfter is set", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw httpError(429, 3); // ask for 3ms
      return "ok";
    });

    await retryWithExponentialBackoff(fn, {
      ...FAST_OPTIONS,
      initialDelay: 1000, // computed backoff would be ~1000ms — retryAfterMs must win
      maxDelay: 5000,
      respectRetryAfter: true,
      onRetry: (_attempt, _error, delay) => delays.push(delay),
    });

    expect(delays).toEqual([3]);
  });

  it("ignores retryAfterMs when respectRetryAfter is not set (default off, existing callers unaffected)", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw httpError(429, 999999);
      return "ok";
    });

    await retryWithExponentialBackoff(fn, {
      ...FAST_OPTIONS,
      onRetry: (_attempt, _error, delay) => delays.push(delay),
    });

    expect(delays[0]).toBeLessThan(999999);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses a numeric (seconds) Retry-After header", () => {
    const res = new Response(null, { headers: { "retry-after": "2" } });
    expect(parseRetryAfterMs(res)).toBe(2000);
  });

  it("parses an HTTP-date Retry-After header", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const res = new Response(null, { headers: { "retry-after": future } });
    const ms = parseRetryAfterMs(res);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it("returns undefined when the header is absent", () => {
    const res = new Response(null);
    expect(parseRetryAfterMs(res)).toBeUndefined();
  });

  it("returns undefined for an unparseable header", () => {
    const res = new Response(null, { headers: { "retry-after": "garbage" } });
    expect(parseRetryAfterMs(res)).toBeUndefined();
  });
});
