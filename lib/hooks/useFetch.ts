"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * RA-914: Extended options for useFetch.
 *
 * All new fields are optional — existing callers that pass nothing or pass
 * plain RequestInit options continue to work without any changes.
 *
 * @property skip          - When true, skip the fetch entirely (e.g. while session loads).
 * @property optimisticData - Show this value immediately as `data` before the network response arrives.
 *                            Reverts to null on error.
 * @property dedupe        - When true, skip the fetch if another instance is already fetching
 *                            the same URL. NOTE: the dedup set is module-level — it persists
 *                            across unmounts. A URL in-flight when a component unmounts+remounts
 *                            will not re-fetch until the in-flight request completes.
 * @property retryCount    - Number of retries on network error (AbortError is never retried).
 *                            Does NOT retry 4xx/5xx responses. Backoff: 500ms × attempt number.
 */
export interface UseFetchOptions<T> extends Omit<RequestInit, "signal"> {
  skip?: boolean;
  optimisticData?: T;
  dedupe?: boolean;
  retryCount?: number;
}

// RA-914: Module-level dedup set — one entry per URL currently being fetched.
// Intentionally outside the hook so it spans all mounted instances.
const _inFlightUrls = new Set<string>();

/**
 * Data-fetching hook with:
 *  - Automatic AbortController cleanup on unmount (prevents state-on-unmounted-component)
 *  - Re-fetches automatically when `url` changes
 *  - Pass `url = null` (or `skip: true`) to skip fetching
 *  - Generic over response shape — caller specifies T
 *  - Optional: optimistic data, request deduplication, retry on network error
 *
 * @example
 * // Basic usage — unchanged from before
 * const { data, loading, error, refetch } = useFetch<{ reports: Report[] }>("/api/reports");
 *
 * @example
 * // With RA-914 extensions
 * const { data } = useFetch<DashboardData>("/api/dashboard", {
 *   optimisticData: cachedDashboard,
 *   dedupe: true,
 *   retryCount: 2,
 * });
 */
export function useFetch<T>(
  url: string | null,
  options?: UseFetchOptions<T>,
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(
    options?.optimisticData !== undefined ? options.optimisticData : null,
  );
  const [loading, setLoading] = useState<boolean>(!!url && !options?.skip);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Stable reference to options to avoid unnecessary refetches
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const refetch = useCallback(() => {
    const opts = optionsRef.current;

    if (!url || opts?.skip) {
      setLoading(false);
      return;
    }

    // Deduplication: skip if another instance is already fetching this URL
    if (opts?.dedupe && _inFlightUrls.has(url)) {
      return;
    }

    // Abort any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    // Show optimistic data immediately if provided
    if (opts?.optimisticData !== undefined) {
      setData(opts.optimisticData);
    }

    if (opts?.dedupe) {
      _inFlightUrls.add(url);
    }

    // Extract hook-specific keys so they are not passed to fetch()
    const { skip: _skip, optimisticData: _opt, dedupe: _ded, retryCount: _rc, ...fetchInit } = opts ?? {};
    const maxRetries = opts?.retryCount ?? 0;

    const attemptFetch = (attempt: number): void => {
      fetch(url, { signal: controller.signal, ...fetchInit })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
          }
          return res.json() as Promise<T>;
        })
        .then((json) => {
          setData(json);
          setLoading(false);
          if (opts?.dedupe) _inFlightUrls.delete(url);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            if (opts?.dedupe) _inFlightUrls.delete(url);
            return;
          }

          // Retry on network error (not on HTTP error codes)
          const isNetworkError =
            err instanceof TypeError && err.message === "Failed to fetch";
          if (isNetworkError && attempt < maxRetries) {
            // Linear backoff: 500ms × attempt number (1-indexed)
            setTimeout(() => attemptFetch(attempt + 1), 500 * (attempt + 1));
            return;
          }

          if (opts?.dedupe) _inFlightUrls.delete(url);
          // Revert optimistic data on error
          if (opts?.optimisticData !== undefined) {
            setData(null);
          }
          const message = err instanceof Error ? err.message : "Request failed";
          setError(message);
          setLoading(false);
        });
    };

    attemptFetch(0);
  }, [url]); // re-runs when URL changes (e.g. search params update)

  useEffect(() => {
    refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
