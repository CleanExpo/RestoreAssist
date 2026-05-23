"use client";

/**
 * SP-E: Workspace Health tile for the storage mirror queue.
 *
 * Surfaces queue stats + dead-letter pressure so the org owner can spot
 * a stuck mirror without digging into the settings page. Tile turns red
 * when there are FAILED rows, yellow when the queue is backing up, green
 * otherwise.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  lastCompletedAt: string | null;
}

const TONE_FOR_STATE: Record<"green" | "yellow" | "red", string> = {
  green: "bg-green-50 border-green-200",
  yellow: "bg-amber-50 border-amber-200",
  red: "bg-red-50 border-red-200",
};

export function StorageMirrorHealthTile() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/storage/mirror-jobs?limit=1");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: { stats: Stats } };
        if (!cancelled) setStats(json.data.stats);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <Card className={TONE_FOR_STATE.red}>
        <CardHeader>
          <CardTitle className="text-base">Storage mirror</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Could not load mirror queue status.
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storage mirror</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  const state: "green" | "yellow" | "red" =
    stats.failed > 0 ? "red" : stats.pending > 20 ? "yellow" : "green";

  return (
    <Card className={TONE_FOR_STATE[state]}>
      <CardHeader>
        <CardTitle className="text-base">Storage mirror</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          Pending <strong>{stats.pending}</strong> · Processing{" "}
          <strong>{stats.processing}</strong> · Failed{" "}
          <strong>{stats.failed}</strong>
        </div>
        {stats.lastCompletedAt && (
          <div className="text-xs text-muted-foreground">
            Last completed{" "}
            {new Date(stats.lastCompletedAt).toLocaleString("en-AU")}
          </div>
        )}
        <a
          className="text-xs underline"
          href="/dashboard/settings/storage"
        >
          Open storage settings →
        </a>
      </CardContent>
    </Card>
  );
}
