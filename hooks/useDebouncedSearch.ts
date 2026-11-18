"use client";

import { useEffect, useRef, useState } from "react";

/** Wait this long after the last change before sending a request. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface DebouncedSearchState<T> {
  /** Parsed body of the latest successful request, or null. */
  data: T | null;
  /** True from the change until the latest request settles. */
  loading: boolean;
  /** True when the latest request failed (non-2xx, network error or bad body). */
  error: boolean;
}

/**
 * The one owner of "fetch as the user types" (RA-8448).
 *
 * Pass the URL to fetch, or null for "no search". The hook waits
 * SEARCH_DEBOUNCE_MS after the URL last changed, sends one request, aborts
 * the previous one, and ignores any reply that is not for the latest URL.
 * A non-2xx reply is an error, never an empty result.
 *
 * Search endpoints are rate limited per user or IP; one request per
 * keystroke spends the allowance in a few searches. Do not copy this
 * timing logic into a component; call this hook.
 */
export function useDebouncedSearch<T>(
  url: string | null,
  parse: (body: unknown) => T,
  delayMs: number = SEARCH_DEBOUNCE_MS,
): DebouncedSearchState<T> {
  const [state, setState] = useState<DebouncedSearchState<T>>({
    data: null,
    loading: url !== null,
    error: false,
  });
  const latest = useRef(0);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  useEffect(() => {
    const id = ++latest.current;
    if (url === null) {
      setState({ data: null, loading: false, error: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: false }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (id !== latest.current) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = parseRef.current(await res.json());
        if (id !== latest.current) return;
        setState({ data, loading: false, error: false });
      } catch (err) {
        if (id !== latest.current || controller.signal.aborted) return;
        console.error("Search request failed:", err);
        setState({ data: null, loading: false, error: true });
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, delayMs]);

  return state;
}
