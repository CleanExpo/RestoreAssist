/**
 * RA-273 — fetchAscoraWithRetry: transient failures are retried with
 * exponential backoff (honouring Retry-After), terminal failures are not.
 * Fast custom retryOptions are used throughout so the suite doesn't wait out
 * DEFAULT_RETRY_OPTIONS' real 1s/10s delays.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAscoraWithRetry } from "../fetch-with-retry";
import type { RetryOptions } from "../../retry";

const FAST_RETRY: RetryOptions = {
  maxRetries: 2,
  initialDelay: 1,
  maxDelay: 5,
  factor: 2,
};

function jsonResponse(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("fetchAscoraWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a transient 503 and succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls < 2) return jsonResponse(503, { message: "unavailable" });
        return jsonResponse(200, { success: true, results: [] });
      }),
    );

    const res = await fetchAscoraWithRetry(
      "https://api.ascora.com.au/jobs",
      { headers: { Auth: "key" } },
      { retryOptions: FAST_RETRY },
    );

    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not retry a terminal 401 and throws with status attached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { message: "bad key" })),
    );

    await expect(
      fetchAscoraWithRetry(
        "https://api.ascora.com.au/jobs",
        { headers: { Auth: "bad" } },
        { retryOptions: FAST_RETRY, context: "/jobs (page 1)" },
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries on a persistent 500", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, { message: "boom" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAscoraWithRetry(
        "https://api.ascora.com.au/jobs",
        {},
        { retryOptions: FAST_RETRY },
      ),
    ).rejects.toThrow();

    // 1 initial + 2 retries = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a 429 (rate limit) and succeeds, reading its Retry-After header", async () => {
    let calls = 0;
    const delays: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) {
          return jsonResponse(
            429,
            { message: "rate limited" },
            { "retry-after": "1" },
          );
        }
        return jsonResponse(200, { success: true, results: [] });
      }),
    );

    // initialDelay set far above the 1s Retry-After so a passing delays[0]
    // near 1000ms proves the header — not the computed backoff — won.
    const res = await fetchAscoraWithRetry(
      "https://api.ascora.com.au/jobs",
      {},
      {
        retryOptions: {
          ...FAST_RETRY,
          initialDelay: 60000,
          maxDelay: 120000,
          onRetry: (_attempt, _error, delay) => delays.push(delay),
        },
      },
    );

    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(delays[0]).toBe(1000);
  }, 10000);
});
