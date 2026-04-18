"use client";

import { useState, useCallback } from "react";

/**
 * RA-914: useMutation — standard POST/PUT/PATCH/DELETE wrapper.
 *
 * Provides consistent loading state, error handling, and reset across all
 * mutation call sites. Replaces ad-hoc raw fetch() + useCallback patterns.
 *
 * NOTE: File uploads (FormData) are a V2 extension — not handled here.
 * For file uploads, use fetch() directly with a FormData body.
 *
 * @example
 * const { mutate, loading, error, reset } = useMutation<
 *   { id: string },          // TResponse — what the API returns
 *   { name: string }         // TBody — what you send
 * >("/api/reports", { method: "POST" });
 *
 * const handleCreate = async () => {
 *   const result = await mutate({ name: "New Report" });
 *   if (result) router.push(`/dashboard/reports/${result.id}`);
 * };
 */

interface UseMutationOptions {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
}

interface UseMutationResult<TResponse, TBody> {
  mutate: (body?: TBody) => Promise<TResponse | null>;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function useMutation<TResponse = unknown, TBody = unknown>(
  url: string,
  options?: UseMutationOptions,
): UseMutationResult<TResponse, TBody> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body?: TBody): Promise<TResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method: options?.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
          const errData = await res
            .json()
            .catch(() => ({ error: res.statusText }));
          const message = errData?.error ?? `Request failed: ${res.status}`;
          setError(message);
          return null;
        }

        return (await res.json()) as TResponse;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, options?.method],
  );

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { mutate, loading, error, reset };
}
