"use client";

import Link from "next/link";
import { buildHomeownerNextActions } from "@/lib/portal/homeowner-next-actions";
import { PORTAL_SECTION_IDS } from "@/lib/portal/portal-section-ids";
import {
  clientPortalEyebrow,
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";
import { usePortalUpdates } from "@/lib/portal/use-portal-updates";
import type { PortalUpdatesFeed } from "@/lib/portal/portal-updates-types";

function StatusSkeleton() {
  return (
    <section
      className={`${clientPortalPanelPadding} animate-pulse space-y-3`}
      aria-busy="true"
      aria-label="Loading claim status"
    >
      <div className="flex justify-between gap-3">
        <div className="h-4 w-28 rounded bg-slate-800" />
        <div className="h-4 w-24 rounded bg-slate-800" />
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800" />
      <div className="flex gap-3">
        <div className="h-3 w-16 rounded bg-slate-800" />
        <div className="h-3 w-20 rounded bg-slate-800" />
        <div className="h-3 w-14 rounded bg-slate-800" />
      </div>
    </section>
  );
}

function NextActions({
  actions,
}: {
  actions: ReturnType<typeof buildHomeownerNextActions>;
}) {
  if (actions.length === 0) return null;

  const toneClass = (tone: (typeof actions)[0]["tone"]) => {
    if (tone === "urgent") return "border-amber-400/35 bg-amber-500/10";
    if (tone === "ready") return "border-emerald-400/35 bg-emerald-500/10";
    return "border-cyan-400/25 bg-cyan-500/5";
  };

  return (
    <section className={`${clientPortalPanelPadding} space-y-3`}>
      <div>
        <p className={clientPortalEyebrow}>Your next step</p>
        <h2 className="mt-1 text-sm font-semibold text-white/95">
          What to do on this page
        </h2>
      </div>
      <ol className="space-y-2">
        {actions.map((action, index) => (
          <li key={action.id}>
            <Link
              href={action.href}
              className={[
                "block rounded-xl border p-3 transition hover:border-white/20",
                toneClass(action.tone),
              ].join(" ")}
              {...(action.href.startsWith("http") || action.href.startsWith("/api")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Step {index + 1}
              </span>
              <p className="mt-0.5 text-sm font-medium text-white/95">
                {action.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{action.detail}</p>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClaimStatusView({
  feed,
  reportPdfHref,
}: {
  feed: PortalUpdatesFeed;
  reportPdfHref?: string;
}) {
  return (
    <section
      id={PORTAL_SECTION_IDS.status}
      className={`${clientPortalPanelPadding} space-y-3 scroll-mt-6`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white/95">Claim status</h2>
        <span className="text-xs font-medium text-cyan-300">
          {feed.currentStep}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Progress reflects your job stage, not every photo uploaded.
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

export function ClientPortalLiveHub({
  token,
  reportPdfHref,
  interactive,
}: {
  token: string;
  reportPdfHref?: string;
  interactive: boolean;
}) {
  const { feed, loading, error, refresh } = usePortalUpdates(token);
  const actions = buildHomeownerNextActions({
    feed,
    interactive,
    reportPdfHref,
  });

  return (
    <div className="space-y-4">
      {!loading && feed && actions.length > 0 && (
        <NextActions actions={actions} />
      )}
      {loading && !feed && <StatusSkeleton />}
      {feed && <ClaimStatusView feed={feed} reportPdfHref={reportPdfHref} />}
      {error && !feed && !loading && (
        <section className={`${clientPortalPanelPadding} space-y-2`}>
          <p className="text-sm text-slate-300">
            We couldn&apos;t refresh your claim status.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className={`${clientPortalPrimaryLink} !min-h-9 text-xs`}
          >
            Try again
          </button>
        </section>
      )}
    </div>
  );
}
