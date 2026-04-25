"use client";

/**
 * XeroDeadLetterBanner — RA-1112
 *
 * Dismissable banner shown when there are FAILED InvoiceSyncJob records
 * older than 24 hours (jobs that will not self-recover). Directs the user
 * to Settings → Integrations to investigate.
 *
 * Fetches count from GET /api/integrations/xero/dead-letter-count on mount.
 * Dismissed per-session via local state (no server persistence needed).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

export function XeroDeadLetterBanner() {
  const [count, setCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/xero/dead-letter-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof data?.count === "number") setCount(data.count);
      })
      .catch((err) => console.error("[XeroDeadLetterBanner]", err));
  }, []);

  if (dismissed || !count || count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm">
        <strong>
          {count} Xero invoice {count === 1 ? "sync" : "syncs"} failed
        </strong>{" "}
        and will not retry automatically.{" "}
        <Link
          href="/dashboard/integrations"
          className="underline hover:no-underline font-medium"
        >
          Review in Integrations
        </Link>
      </p>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
