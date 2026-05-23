"use client";

import useSWR from "swr";
import type { TrialStatus } from "@/lib/trial-handling";

const fetcher = async (url: string): Promise<TrialStatus> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`trial-status fetch failed: ${res.status}`);
  const body = await res.json();
  return body.data;
};

export default function useTrialStatus() {
  const { data, error, isLoading, mutate } = useSWR<TrialStatus>(
    "/api/billing/trial-status",
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
  return { data, error, isLoading, refresh: mutate };
}
