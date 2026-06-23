"use client";

/**
 * Client-portal live status display (client portal Phase 4 UI).
 *
 * Polls the client-safe updates feed (GET /api/portal/[token]/updates →
 * buildClientStatusFeed) so the client's claim view auto-updates: current step,
 * progress %, report-ready, and any approvals still owed. Read-only.
 */

import { useEffect, useState } from "react";

interface Feed {
  currentStep: string;
  progressPct: number;
  steps: { key: string; label: string; done: boolean }[];
  reportReady: boolean;
  pendingApprovals: { id: string; type: string; label: string }[];
}

const POLL_MS = 30_000;

export function ClientPortalStatus({ token }: { token: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/${token}/updates`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled) setFeed(body.data ?? null);
      } catch {
        /* keep last good state */
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  if (!feed) return null;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Claim status</h2>
        <span className="text-xs font-medium text-cyan-700">
          {feed.currentStep}
        </span>
      </div>

      <div
        className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={feed.progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Claim progress"
      >
        <div
          className="h-full bg-cyan-500 transition-all"
          style={{ width: `${feed.progressPct}%` }}
        />
      </div>

      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {feed.steps.map((s) => (
          <li
            key={s.key}
            className={s.done ? "text-cyan-700 font-medium" : "text-slate-400"}
          >
            {s.done ? "✓" : "○"} {s.label}
          </li>
        ))}
      </ol>

      {feed.reportReady && (
        <p className="text-xs text-success font-medium">
          Your restoration report is ready.
        </p>
      )}

      {feed.pendingApprovals.length > 0 && (
        <p role="status" className="text-xs text-amber-700">
          Action needed: {feed.pendingApprovals.map((a) => a.label).join(", ")}.
        </p>
      )}
    </section>
  );
}
