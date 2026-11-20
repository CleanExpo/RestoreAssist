"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortalUpdatesFeed } from "@/lib/portal/portal-updates-types";

const POLL_MS = 30_000;
const POLL_MS_HIDDEN = 120_000;

export function usePortalUpdates(token: string) {
  const [feed, setFeed] = useState<PortalUpdatesFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/updates`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = await res.json();
      setFeed(body.data ?? null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      if (cancelled) return;
      await load();
    }

    void tick();

    function schedulePoll() {
      if (intervalId) clearInterval(intervalId);
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      const ms = hidden ? POLL_MS_HIDDEN : POLL_MS;
      intervalId = setInterval(tick, ms);
    }

    schedulePoll();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void tick();
      }
      schedulePoll();
    }

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  return { feed, loading, error, refresh: load };
}
