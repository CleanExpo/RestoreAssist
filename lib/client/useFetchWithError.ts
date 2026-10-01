/**
 * RA-1556 — React hook that guarantees every `useEffect` fetch has an
 * error + loading surface.
 *
 * PM Round 2 found 103 pages calling `fetch` from `useEffect` with no
 * error branch — a failed fetch left the UI stuck in a loading state.
 * This hook enforces the "loading / error / data" tri-state so callers
 * cannot forget the error path:
 *
 *   const { data, error, loading, refetch } = useFetchWithError<Invoice[]>(
 *     session ? "/api/invoices" : null,
 *   );
 *
 *   if (loading) return <Skeleton />;
 *   if (error)   return <ErrorCard message={error.message} onRetry={refetch} />;
 *   return <InvoiceTable invoices={data} />;
 *
 * Uses the `parseApiError` envelope from RA-1555 so the `error` object
 * has `{ code, message, eventId, fields, retryAfterSeconds }`.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseApiError,
  type ParsedApiError,
} from "@/lib/client/parse-api-error";

export interface UseFetchWithErrorResult<T> {
  data: T | null;
  error: ParsedApiError | null;
  loading: boolean;
  refetch: () => void;
}

export function useFetchWithError<T>(
  url: string | null,
  init?: RequestInit,
): UseFetchWithErrorResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(url != null);
  const [tick, setTick] = useState(0);

  // Stable ref to init so changing object identity doesn't re-run effect.
  const initRef = useRef(init);
  initRef.current = init;

  useEffect(() => {
    if (url == null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      let responseStatus = 0;
      try {
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          ...initRef.current,
          signal: controller.signal,
        });
        if (cancelled) return;
        responseStatus = res.status;
        if (!res.ok) {
          const failure = await parseApiError(res);
          if (cancelled) return;
          setError(failure);
          setData(null);
        } else {
          const result = (await res.json()) as T;
          if (cancelled) return;
          setData(result);
        }
      } catch {
        if (cancelled) return;
        setData(null);
        setError({
          code: responseStatus ? "INVALID_RESPONSE" : "NETWORK",
          message: responseStatus ? "The server returned an unreadable response." : "Network error",
          status: responseStatus,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refetch };
}
