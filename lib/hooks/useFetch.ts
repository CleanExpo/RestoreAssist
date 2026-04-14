"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Data-fetching hook with:
 *  - Automatic AbortController cleanup on unmount (prevents state-on-unmounted-component)
 *  - Re-fetches automatically when `url` changes
 *  - Pass `url = null` to skip fetching (e.g. while session is loading)
 *  - Generic over response shape — caller specifies T
 *
 * @example
 * const { data, loading, error, refetch } = useFetch<{ reports: Report[] }>("/api/reports");
 * const reports = data?.reports ?? [];
 */
export function useFetch<T>(
  url: string | null,
  options?: Omit<RequestInit, "signal">,
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Stable reference to options to avoid unnecessary refetches
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const refetch = useCallback(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    // Abort any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal, ...optionsRef.current })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<T>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Request failed";
        setError(message);
        setLoading(false);
      });
  }, [url]); // re-runs when URL changes (e.g. search params update)

  useEffect(() => {
    refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
