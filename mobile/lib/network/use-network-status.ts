import { useEffect } from "react";
import { AppState } from "react-native";
import { useAppStore } from "@/lib/store";
import { checkApiReachability } from "@/lib/network/reachability";

const NETWORK_CHECK_INTERVAL_MS = 15_000;

export function useNetworkStatus(): void {
  const setOnline = useAppStore((s) => s.setOnline);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const isReachable = await checkApiReachability();
      if (!cancelled) setOnline(isReachable);
    }

    void refresh();

    const interval = setInterval(refresh, NETWORK_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [setOnline]);
}
