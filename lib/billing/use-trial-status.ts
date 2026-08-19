"use client";

import useSWR from "swr";
import { useSession } from "next-auth/react";
import type { TrialStatus } from "@/lib/trial-handling";

const fetcher = async (url: string): Promise<TrialStatus | null> => {
  const res = await fetch(url, { credentials: "include" });
  // Defense-in-depth: callers gate on session, but a race can still land
  // a 401. Soft-null keeps the banner hidden instead of SWR error spam.
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`trial-status fetch failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? null;
};

/**
 * Client hook for GET /api/billing/trial-status.
 * Skips the network call until NextAuth reports an authenticated session —
 * matching DashboardShell's profile fetch and avoiding noisy 401s during
 * the loading → authenticated race on dashboard mount.
 */
export default function useTrialStatus() {
  const { status } = useSession();
  const { data, error, isLoading, mutate } = useSWR<TrialStatus | null>(
    status === "authenticated" ? "/api/billing/trial-status" : null,
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
  return {
    data: data ?? undefined,
    error,
    isLoading: status === "loading" || isLoading,
    refresh: mutate,
  };
}
