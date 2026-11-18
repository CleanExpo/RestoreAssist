"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * One request started by {@link useLatestFetch}.
 *
 * - `signal` goes to every `fetch()` the request makes.
 * - `isLatest()` is true only while no newer request has started and the
 *   component is still mounted. Check it after every `await` and before every
 *   state write; when it is false, drop the reply.
 */
export interface LatestRequest {
  signal: AbortSignal;
  isLatest: () => boolean;
}

/**
 * RA-8454: latest-only requests for screens whose filters change while a
 * request is in flight (date range, month, provider, team member).
 *
 * Each call to the returned `begin()` aborts the previous request and hands
 * back a fresh {@link LatestRequest}. A slower, older reply can therefore
 * never overwrite the newer filter's data, and an aborted request's
 * `AbortError` can be recognised by `!req.isLatest()`. The in-flight request
 * is also aborted on unmount.
 *
 * This is the one shared owner of the rule; do not hand-roll a per-screen
 * counter or `cancelled` flag.
 *
 * @example
 * const beginRequest = useLatestFetch();
 * const load = useCallback(async (month: string) => {
 *   const req = beginRequest();
 *   setLoading(true);
 *   try {
 *     const res = await fetch(`/api/x?month=${month}`, { signal: req.signal });
 *     const json = await res.json();
 *     if (!req.isLatest()) return;
 *     setData(json);
 *   } catch (err) {
 *     if (!req.isLatest()) return; // aborted or superseded
 *     setError(String(err));
 *   } finally {
 *     if (req.isLatest()) setLoading(false);
 *   }
 * }, [beginRequest]);
 */
export function useLatestFetch(): () => LatestRequest {
  const currentRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      currentRef.current?.abort();
      currentRef.current = null;
    },
    [],
  );

  return useCallback(() => {
    currentRef.current?.abort();
    const controller = new AbortController();
    currentRef.current = controller;
    return {
      signal: controller.signal,
      isLatest: () =>
        currentRef.current === controller && !controller.signal.aborted,
    };
  }, []);
}
