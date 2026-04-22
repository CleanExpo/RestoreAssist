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
import { parseApiError, type ParsedApiError } from "@/lib/client/parse-api-error";

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
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(url, initRef.current);
        if (cancelled) return;
        if (!res.ok) {
          setError(await parseApiError(res));
          setData(null);
        } else {
          setData((await res.json()) as T);
        }
      } catch (err) {
        if (cancelled) return;
        setError({
          code: "NETWORK",
          message: err instanceof Error ? err.message : "Network error",
          status: 0,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refetch };
}
