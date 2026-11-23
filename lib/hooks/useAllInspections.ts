"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllInspections } from "@/lib/inspections/fetch-all-inspections";
import type { UseFetchResult } from "@/lib/hooks/useFetch";

/**
 * RA-8092: the jobs list's loader. Same contract as `useFetch` (pass
 * `url = null` to wait), but it walks every page of `/api/inspections`, so
 * search, status counts and Select all cover every job in reach. Data is set
 * only once every page has arrived; a partial list is never shown as the whole.
 */
export function useAllInspections<T extends { id: string }>(
  url: string | null,
): UseFetchResult<{ inspections: T[] }> {
  const [data, setData] = useState<{ inspections: T[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runFetch = useCallback(
    (complete?: (ok: boolean) => void) => {
      if (!url) {
        setLoading(false);
        complete?.(false);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      fetchAllInspections<T>(url, { signal: controller.signal })
        .then((inspections) => {
          if (controller.signal.aborted) return;
          setData({ inspections });
          setLoading(false);
          complete?.(true);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) {
            complete?.(false);
            return;
          }
          setError(err instanceof Error ? err.message : "Request failed");
          setLoading(false);
          complete?.(false);
        });
    },
    [url],
  );

  const refetch = useCallback(() => runFetch(), [runFetch]);
  const refresh = useCallback(
    () => new Promise<boolean>((resolve) => runFetch(resolve)),
    [runFetch],
  );

  useEffect(() => {
    refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [refetch]);

  return { data, loading, error, refetch, refresh };
}
