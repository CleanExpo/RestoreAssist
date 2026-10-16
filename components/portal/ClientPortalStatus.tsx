"use client";

/**
 * Client-portal live status display (client portal Phase 4 UI).
 *
 * Polls the client-safe updates feed (GET /api/portal/[token]/updates →
 * buildClientStatusFeed + buildDryingTimeline) so the client's claim view
 * auto-updates: current step, progress %, report-ready, any approvals still
 * owed, and a curated per-area drying timeline (RA-6950). Read-only. The
 * drying timeline only ever carries a curated on-track/needs-attention state
 * and an "estimate" label — never a raw moisture reading (drying logs are
 * legal exhibits).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

interface AreaDryingState {
  areaId: string;
  areaLabel: string;
  status: "on-track" | "needs-attention";
  estimateLabel: string;
}

interface Feed {
  currentStep: string;
  progressPct: number;
  steps: { key: string; label: string; done: boolean }[];
  reportReady: boolean;
  pendingApprovals: { id: string; type: string; label: string }[];
  dryingTimeline: AreaDryingState[];
}

const POLL_MS = 30_000;

export function ClientPortalStatus({
  token,
  reportPdfHref,
}: {
  token: string;
  reportPdfHref?: string;
}) {
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
    <section className={`${clientPortalPanelPadding} space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white/95">Claim status</h2>
        <span className="text-xs font-medium text-cyan-300">
          {feed.currentStep}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        The bar reflects your job stage. When your team is still collecting
        photos and notes, a separate evidence score may differ — that is normal.
      </p>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuenow={feed.progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Claim progress"
      >
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all"
          style={{ width: `${feed.progressPct}%` }}
        />
      </div>

      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {feed.steps.map((s) => (
          <li
            key={s.key}
            className={s.done ? "font-medium text-cyan-300" : "text-slate-500"}
          >
            {s.done ? "●" : "○"} {s.label}
          </li>
        ))}
      </ol>

      {feed.reportReady && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-emerald-400">
            Your restoration report is ready.
          </p>
          {reportPdfHref && (
            <Link
              href={reportPdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${clientPortalPrimaryLink} !min-h-8 px-3 py-1.5 text-xs`}
            >
              Open PDF
            </Link>
          )}
        </div>
      )}

      {feed.pendingApprovals.length > 0 && (
        <p role="status" className="text-xs text-amber-300/90">
          Action needed: {feed.pendingApprovals.map((a) => a.label).join(", ")}.
        </p>
      )}

      {feed.dryingTimeline.length > 0 && (
        <div className="border-t border-white/10 pt-1">
          <h3 className="mb-2 mt-3 text-xs font-semibold text-slate-300">
            Drying progress by area
          </h3>
          <ul className="space-y-2">
            {feed.dryingTimeline.map((area) => (
              <li key={area.areaId} className="space-y-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-300">
                    {area.areaLabel}
                  </span>
                  <span
                    className={[
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      area.status === "on-track"
                        ? "bg-success-subtle text-success-subtle-foreground"
                        : "bg-warning-subtle text-warning-subtle-foreground",
                    ].join(" ")}
                  >
                    {area.status === "on-track" ? "On track" : "Needs attention"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{area.estimateLabel}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
