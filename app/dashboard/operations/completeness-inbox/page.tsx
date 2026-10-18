"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChromeAlertTriangle, ChromeCalendar, ChromeCheckCircle, ChromeClipboardCheck, ChromeInbox, ChromeRefresh, ChromeSearch } from "@/components/brand/chrome-icons";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { SimpleDashboardPageFrame } from "@/app/dashboard/components/SimpleDashboardPageFrame";
import {
  DashboardPanel,
  dashboardSurfaceClass,
} from "@/app/dashboard/components/DashboardPanel";
import {
  completenessBlockerAction,
  completenessBlockerHref,
  completenessBlockerLabel,
  type CompletenessBlockerId,
} from "@/lib/dashboard/completeness-blocker-links";
import { workspaceHubLinks } from "@/lib/dashboard/workspace-secondary-links";
import { cn } from "@/lib/utils";

type Row = {
  inspectionId: string;
  inspectionNumber: string | null;
  propertyAddress: string;
  status: string;
  completionPercent: number;
  blocking: string[];
};

type SortKey = "gaps-desc" | "completion-asc";

const BLOCKER_ORDER: CompletenessBlockerId[] = [
  "client",
  "loss_date",
  "s500",
  "photos",
  "baseline",
  "monitoring",
];

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "CLOSED") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }
  if (s === "DRAFT") {
    return "bg-neutral-200 text-neutral-700 dark:bg-slate-700 dark:text-slate-200";
  }
  return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
}

function LineSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
    />
  );
}

export default function CompletenessInboxPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [blockerFilter, setBlockerFilter] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("gaps-desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/completeness-inbox", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          body?.error?.message ??
          (res.status === 403
            ? "Only managers and owners can open this inbox."
            : "Could not load the completeness inbox.");
        throw new Error(message);
      }
      const json = await res.json();
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const blockerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const b of row.blocking) {
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((row) => {
      if (blockerFilter !== "all" && !row.blocking.includes(blockerFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        row.propertyAddress?.toLowerCase().includes(q) ||
        row.inspectionNumber?.toLowerCase().includes(q) ||
        row.inspectionId.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "completion-asc") {
        return a.completionPercent - b.completionPercent;
      }
      if (sort === "gaps-desc") {
        return b.blocking.length - a.blocking.length;
      }
      return 0;
    });
    return list;
  }, [rows, search, blockerFilter, sort]);

  const totalGaps = useMemo(
    () => rows.reduce((n, r) => n + r.blocking.length, 0),
    [rows],
  );

  const initialLoad = loading && rows.length === 0 && !error;

  return (
    <SimpleDashboardPageFrame className="space-y-6 pb-10 pt-2">
      <DashboardListPageHeader
        eyebrow="Simple workspace"
        title="Completeness inbox"
        description="Active jobs with blocking intake gaps — fix each item on the job or jump straight to the right tab."
        icon={<ChromeInbox className="h-7 w-7 text-cyan-500" aria-hidden />}
        primaryAction={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/dashboard/inspections/schedule"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800 sm:flex-none"
            >
              <ChromeCalendar className="h-4 w-4" aria-hidden />
              Job schedule
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-95 disabled:opacity-50 sm:flex-none"
            >
              <ChromeRefresh
                className={cn("h-4 w-4", loading && "animate-spin")}
                aria-hidden
              />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        }
        secondaryLinks={workspaceHubLinks({
          omitHref: "/dashboard/operations/completeness-inbox",
        })}
      />

      {!error && !initialLoad && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Jobs with gaps" value={rows.length} accent="amber" />
          <StatCard label="Open blockers" value={totalGaps} accent="cyan" />
          <StatCard
            label="Avg completion"
            value={
              rows.length
                ? `${Math.round(
                    rows.reduce((s, r) => s + r.completionPercent, 0) /
                      rows.length,
                  )}%`
                : "—"
            }
            accent="violet"
          />
          <StatCard
            label="Filtered"
            value={filtered.length}
            accent="neutral"
            hint="Matching your search & filters"
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 sm:px-5"
        >
          <p className="text-sm font-medium text-red-900 dark:text-red-200">
            {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-11 rounded-lg border border-red-500/40 px-4 text-sm font-medium text-red-900 dark:text-red-200"
            >
              Try again
            </button>
            <Link
              href="/dashboard/help"
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium"
            >
              Help
            </Link>
          </div>
        </div>
      )}

      {!error && (
        <DashboardPanel className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 max-w-xl">
              <ChromeSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search address or job number…"
                aria-label="Search completeness inbox"
                className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                aria-label="Sort jobs"
              >
                <option value="gaps-desc">Most blockers first</option>
                <option value="completion-asc">Lowest completion first</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by blocker">
            <FilterChip
              active={blockerFilter === "all"}
              onClick={() => setBlockerFilter("all")}
              label={`All (${rows.length})`}
            />
            {BLOCKER_ORDER.filter((id) => blockerCounts.has(id)).map((id) => (
              <FilterChip
                key={id}
                active={blockerFilter === id}
                onClick={() =>
                  setBlockerFilter((prev) => (prev === id ? "all" : id))
                }
                label={`${completenessBlockerLabel(id)} (${blockerCounts.get(id) ?? 0})`}
              />
            ))}
          </div>
        </DashboardPanel>
      )}

      {initialLoad && (
        <div className="space-y-3" role="status" aria-label="Loading inbox">
          {Array.from({ length: 4 }).map((_, i) => (
            <LineSkeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div
          className={cn(
            "rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-card p-8 text-center",
            dashboardSurfaceClass,
          )}
        >
          <ChromeCheckCircle
            className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <h2 className="mt-3 text-lg font-semibold text-foreground">
            Team is caught up
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No blocking gaps on active jobs right now.
          </p>
          <Link
            href="/dashboard/inspections"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            <ChromeClipboardCheck className="h-4 w-4" aria-hidden />
            View all jobs
          </Link>
        </div>
      )}

      {!error && rows.length > 0 && filtered.length === 0 && !initialLoad && (
        <p className="text-center text-sm text-muted-foreground">
          No jobs match your search or filter.{" "}
          <button
            type="button"
            className="font-medium text-primary underline"
            onClick={() => {
              setSearch("");
              setBlockerFilter("all");
            }}
          >
            Clear filters
          </button>
        </p>
      )}

      <ul className="space-y-4">
        {filtered.map((row) => (
          <li key={row.inspectionId}>
            <article className="overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-amber-500/[0.04] shadow-sm">
              <div className="border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <ChromeAlertTriangle
                        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/inspections/${row.inspectionId}`}
                          className="text-base font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          {row.propertyAddress ||
                            row.inspectionNumber ||
                            "Open job"}
                        </Link>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {row.inspectionNumber ? (
                            <span>{row.inspectionNumber}</span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 font-medium",
                              statusTone(row.status),
                            )}
                          >
                            {formatStatus(row.status)}
                          </span>
                          <span>{row.blocking.length} blocker(s)</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 max-w-md">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Intake completion</span>
                        <span className="tabular-nums font-medium text-foreground">
                          {row.completionPercent}%
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={row.completionPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-cyan-500 transition-all"
                          style={{ width: `${row.completionPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                    <Link
                      href={`/dashboard/inspections/${row.inspectionId}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted/50"
                    >
                      Open job
                    </Link>
                    {row.blocking[0] ? (
                      <Link
                        href={completenessBlockerHref(
                          row.inspectionId,
                          row.blocking[0],
                        )}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-95"
                      >
                        {completenessBlockerAction(row.blocking[0])}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
              {row.blocking.length > 0 ? (
                <ul className="divide-y divide-border/60 px-4 sm:px-5">
                  {row.blocking.map((item) => (
                    <li
                      key={item}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <span className="text-foreground">
                        {completenessBlockerLabel(item)}
                      </span>
                      <Link
                        href={completenessBlockerHref(row.inspectionId, item)}
                        className="inline-flex min-h-9 items-center rounded-lg border border-cyan-500/40 bg-cyan-500/5 px-3 text-xs font-semibold text-cyan-800 hover:bg-cyan-500/10 dark:text-cyan-300"
                      >
                        {completenessBlockerAction(item)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </SimpleDashboardPageFrame>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent: "amber" | "cyan" | "violet" | "neutral";
}) {
  const accentClass = {
    amber: "from-amber-500/15 to-card border-amber-500/20",
    cyan: "from-cyan-500/15 to-card border-cyan-500/20",
    violet: "from-violet-500/15 to-card border-violet-500/20",
    neutral: "from-muted/40 to-card border-border",
  }[accent];
  return (
    <div
      className={cn(
        "rounded-xl border bg-gradient-to-br p-4 shadow-sm",
        accentClass,
        dashboardSurfaceClass,
      )}
    >
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs font-medium transition sm:text-sm",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
