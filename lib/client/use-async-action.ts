/**
 * RA-1573 — `useAsyncAction` primitive for RA-1109 compliance.
 *
 * RA-1109 prohibits silent-success: every async user action must show
 * progress while running and announce its outcome. PM Round 4 found
 * only ~30% of async onClick / onSubmit handlers set `disabled={loading}`
 * or surface success. This hook makes it one line:
 *
 *   const { run, loading, error } = useAsyncAction(async () => {
 *     const res = await fetch("/api/invoices", { method: "POST", body });
 *     if (!res.ok) throw await parseApiError(res);
 *     return res.json();
 *   });
 *
 *   <Button disabled={loading} onClick={run}>
 *     {loading ? "Saving…" : "Save"}
 *   </Button>
 *   {error && <ErrorBanner message={error.message} />}
 *
 * Also exposes `wrap` for handler factories where the action depends on
 * event args:
 *
 *   const [deleteAction, { loading }] = useAsyncAction.wrap((id: string) =>
 *     fetch(`/api/invoices/${id}`, { method: "DELETE" })
 *   );
 *   <Button disabled={loading} onClick={() => deleteAction(invoice.id)} />
 */

"use client";

import { useCallback, useRef, useState } from "react";
import type { ParsedApiError } from "@/lib/client/parse-api-error";

export interface UseAsyncActionResult<Args extends unknown[], R> {
  run: (...args: Args) => Promise<R | undefined>;
  loading: boolean;
  error: ParsedApiError | Error | null;
  reset: () => void;
}

export function useAsyncAction<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
): UseAsyncActionResult<Args, R> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ParsedApiError | Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    setLoading(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && "message" in err) {
        setError(err as ParsedApiError);
      } else if (err instanceof Error) {
        setError(err);
      } else {
        setError(new Error(String(err)));
      }
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, loading, error, reset };
}
