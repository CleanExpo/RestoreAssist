"use client";

/**
 * RA-440: Field dashboard — /dashboard/field
 *
 * Mobile-first landing page for on-site technicians.
 * Shows today's active jobs, quick-start buttons, and recent activity.
 * Designed for Capacitor WebView on Android + iOS.
 *
 * Offline behaviour (RA-1842 Task #10):
 * - On successful fetch → writes job list to IndexedDB via job-cache
 * - On network failure → reads from IndexedDB and shows a staleness banner
 * - @capacitor/network listener drives the isOffline state proactively
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  MapPin,
  Droplets,
  Clock,
  Mic,
  Camera,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  WifiOff,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/mobile/MobileNav";
import {
  useMobilePullRefreshHandler,
  type RefreshResult,
} from "@/components/mobile/MobilePullToRefresh";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import {
  cacheJobs,
  getCachedJobs,
  type CachedJob,
} from "@/lib/offline/job-cache";
import {
  fetchOfflineReplay,
  getOfflineOwner,
  ownsOfflineEntry,
  OFFLINE_CONTEXT_EVENT,
  refreshOfflineOwner,
} from "@/lib/offline/account-boundary";
import { isCapacitor } from "@/lib/capacitor";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";
import {
  simpleDashboardHeroShell,
  simpleDashboardHeroShine,
} from "@/lib/dashboard/simple-dashboard-theme";
import { formatAttendanceDateEnAu } from "@/lib/inspections/format-attendance-date";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-white/50",
  SUBMITTED: "text-amber-400",
  PROCESSING: "text-blue-400",
  CLASSIFIED: "text-purple-400",
  SCOPED: "text-cyan-400",
  ESTIMATED: "text-emerald-400",
  IN_BILLING: "text-brand-gold",
  COMPLETED: "text-success",
};

const ACTIVE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
  "IN_BILLING",
];

function formatInspectionDate(dateStr: string | null): string {
  if (!dateStr) return "Attendance unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Attendance unknown";
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const short = formatAttendanceDateEnAu(dateStr);
  return short ?? format(d, "d MMM");
}

function statusLine(
  loading: boolean,
  loadError: string | null,
  activeCount: number,
): string {
  if (loading) return "Loading your jobs…";
  if (loadError) return "Jobs not loaded — use Retry below.";
  return `${activeCount} active job${activeCount !== 1 ? "s" : ""}`;
}

export default function FieldDashboardPage() {
  const [inspections, setInspections] = useState<CachedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("Good morning");
  const [isOffline, setIsOffline] = useState(false);
  const [cacheAge, setCacheAge] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // refreshOfflineOwner() fires OFFLINE_CONTEXT_EVENT while loadInspections()
  // waits on it; that load continues by itself, so the listener must not start
  // a second one.
  const ownerRefreshInProgress = useRef(false);

  useEffect(() => {
    const clear = () => {
      setInspections([]);
      setFromCache(false);
      setCacheAge(null);
      if (getOfflineOwner() && !ownerRefreshInProgress.current) {
        void loadInspections();
      }
    };
    window.addEventListener(OFFLINE_CONTEXT_EVENT, clear);
    return () => window.removeEventListener(OFFLINE_CONTEXT_EVENT, clear);
  }, []);

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 17) setGreeting("Good afternoon");
    else if (h >= 17) setGreeting("Good evening");
  }, []);

  useEffect(() => {
    if (!isCapacitor()) return;
    let cleanup: (() => void) | undefined;
    import("@capacitor/network")
      .then(({ Network }) => {
        Network.getStatus().then(({ connected }) => setIsOffline(!connected));
        Network.addListener("networkStatusChange", ({ connected }) => {
          setIsOffline(!connected);
          if (connected) loadInspections();
        }).then((handle) => {
          cleanup = () => handle.remove();
        });
      })
      .catch(() => {});
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInspections(): Promise<RefreshResult> {
    // The offline owner is set once the session has been verified. On a fresh
    // load (or after it was cleared) verify it now rather than reporting a
    // failed load; Retry comes back through here and verifies again. Offline,
    // refreshOfflineOwner() resolves null and the reconnect message stands.
    let requestOwner = getOfflineOwner();
    if (!requestOwner) {
      ownerRefreshInProgress.current = true;
      try {
        requestOwner = await refreshOfflineOwner();
      } finally {
        ownerRefreshInProgress.current = false;
      }
    }
    if (!requestOwner) {
      setInspections([]);
      setLoading(false);
      setLoadError(
        "Reconnect to verify your account. Saved offline work is preserved.",
      );
      return {
        kind: "cancelled",
        message:
          "Reconnect to verify your account. Saved offline work is preserved.",
      };
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchOfflineReplay(
        requestOwner,
        `/api/inspections?status=${ACTIVE_STATUSES.join(",")}&assignee=me&limit=100`,
        { cache: "no-store" },
      );
      if (!res) {
        throw new Error(
          "Reconnect to verify your account. Saved offline work is preserved.",
        );
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error(
            typeof body.error === "string"
              ? body.error
              : "Failed to load jobs",
          ),
          { httpStatus: res.status, isHttpError: true },
        );
      }
      const data = await res.json();
      const items = (data.inspections ?? data.data ?? []) as Array<{
        id: string;
        inspectionNumber: string;
        propertyAddress: string;
        status: string;
        inspectionDate: string | null;
        moistureReadings?: unknown[];
      }>;

      const enriched = await Promise.all(
        items.map(async (insp) => {
          try {
            const clRes = await fetchOfflineReplay(
              requestOwner,
              `/api/inspections/${encodeURIComponent(insp.id)}/voice/checklist`,
              { cache: "no-store" },
            );
            const cl = clRes?.ok
              ? await clRes.json()
              : { criticalMissing: [], readyToLeave: false };
            return {
              id: insp.id,
              inspectionNumber: insp.inspectionNumber,
              propertyAddress: insp.propertyAddress,
              status: insp.status,
              inspectionDate: insp.inspectionDate,
              moistureReadingCount: insp.moistureReadings?.length ?? 0,
              criticalMissing: cl.criticalMissing?.length ?? 0,
              readyToLeave: cl.readyToLeave ?? false,
            } satisfies CachedJob;
          } catch {
            return {
              id: insp.id,
              inspectionNumber: insp.inspectionNumber,
              propertyAddress: insp.propertyAddress,
              status: insp.status,
              inspectionDate: insp.inspectionDate,
              moistureReadingCount: insp.moistureReadings?.length ?? 0,
              criticalMissing: 0,
              readyToLeave: false,
            } satisfies CachedJob;
          }
        }),
      );

      if (requestOwner && !ownsOfflineEntry({ owner: requestOwner })) {
        return {
          kind: "cancelled",
          message: "Account changed. Refresh cancelled.",
        };
      }
      setInspections(enriched);
      setFromCache(false);
      setCacheAge(null);
      setIsOffline(false);
      await cacheJobs(enriched, requestOwner);
      return { kind: "updated", message: "Jobs updated" };
    } catch (err) {
      if (!ownsOfflineEntry({ owner: requestOwner })) {
        setInspections([]);
        setLoadError(
          "Reconnect to verify your account. Saved offline work is preserved.",
        );
        return {
          kind: "cancelled",
          message: "Account changed. Refresh cancelled.",
        };
      }
      const isHttpError =
        err instanceof Error &&
        "isHttpError" in err &&
        (err as { isHttpError?: boolean }).isHttpError;

      if (isHttpError) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load jobs",
        );
        setIsOffline(false);
        return { kind: "error", message: "Could not refresh jobs. Try again." };
      }
      const { jobs, fetchedAt } = await getCachedJobs(requestOwner);
      if (requestOwner && !ownsOfflineEntry({ owner: requestOwner })) {
        return {
          kind: "cancelled",
          message: "Account changed. Refresh cancelled.",
        };
      }
      if (jobs.length === 0) {
        setLoadError("check your connection and try again");
      }
      if (jobs.length > 0) {
        setInspections(jobs);
        setFromCache(true);
        setCacheAge(
          fetchedAt
            ? formatDistanceToNow(new Date(fetchedAt), { addSuffix: true })
            : null,
        );
      }
      setIsOffline(true);
      return {
        kind: "offline",
        message:
          jobs.length > 0
            ? "Offline. Showing saved jobs."
            : "Offline. No saved jobs available.",
      };
    } finally {
      setLoading(false);
    }
  }

  useMobilePullRefreshHandler(loadInspections);

  useEffect(() => {
    loadInspections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeJobs = inspections.filter((i) =>
    ACTIVE_STATUSES.includes(i.status),
  );
  const nextJob = activeJobs[0];
  const statusText = statusLine(loading, loadError, activeJobs.length);

  return (
    <DashboardPageFrame className="space-y-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-2">
      {(isOffline || fromCache) && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1">
            {isOffline
              ? fromCache && cacheAge
                ? `Offline — showing snapshot from ${cacheAge}. New captures queue on this device.`
                : "Offline — connect to load jobs. New captures queue on this device."
              : cacheAge
                ? `Cached snapshot from ${cacheAge}`
                : "Showing cached data"}
            {isOffline && (
              <>
                {" "}
                <Link
                  href="/offline"
                  className="underline underline-offset-2"
                >
                  How offline sync works
                </Link>
              </>
            )}
          </span>
          {!isOffline && (
            <button
              type="button"
              onClick={() => void loadInspections()}
              className="text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
              aria-label="Refresh job list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-800 dark:text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1">Could not load jobs — {loadError}</span>
          <button
            type="button"
            onClick={() => void loadInspections()}
            className="flex items-center gap-1 font-medium text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </button>
        </div>
      )}

      <DashboardListPageHeader
        eyebrow="Field workspace"
        title="Field Mode"
        description={`${greeting}. ${statusText}`}
        icon={<Smartphone className="h-7 w-7 text-cyan-400" aria-hidden />}
        primaryAction={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => void loadInspections()}
              disabled={loading}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50 sm:flex-none"
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "animate-spin")}
                aria-hidden
              />
              Refresh
            </button>
            <Link
              href="/dashboard/inspections/new"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 text-sm font-semibold text-white shadow-md hover:from-blue-500 hover:to-cyan-500 sm:flex-none"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New job
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {nextJob ? (
          <Link
            href={`/dashboard/inspections/${nextJob.id}/field`}
            className={cn(
              simpleDashboardHeroShell,
              "flex items-center justify-between p-4 transition-transform active:scale-[0.98]",
            )}
          >
            <div aria-hidden className={simpleDashboardHeroShine} />
            <span className="relative min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">
                Continue next job
              </span>
              <span className="mt-0.5 block truncate text-xs text-white/60">
                {nextJob.propertyAddress}
              </span>
            </span>
            <ChevronRight
              className="relative h-5 w-5 shrink-0 text-cyan-300/80"
              aria-hidden
            />
          </Link>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            {loadError
              ? "Jobs not loaded. Use Retry above."
              : "No active jobs ready yet."}
          </div>
        )}
        <Link
          href="/dashboard/field/bluetooth-pair"
          className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 text-sm font-medium text-foreground shadow-sm transition-transform active:scale-[0.98] hover:border-cyan-500/30"
        >
          <span className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-cyan-500" aria-hidden />
            Pair moisture meter
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
        </Link>
      </div>

      <section id="active" className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active jobs
          </p>
          <Link
            href="/dashboard/inspections"
            className="text-xs font-medium text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
          >
            All jobs
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden
            />
          </div>
        ) : loadError && activeJobs.length === 0 ? null : activeJobs.length ===
          0 ? (
          <div
            className={cn(
              simpleDashboardHeroShell,
              "relative py-12 text-center",
            )}
          >
            <div aria-hidden className={simpleDashboardHeroShine} />
            <MapPin
              className="relative mx-auto h-8 w-8 text-cyan-400/70"
              aria-hidden
            />
            <p className="relative mt-3 text-sm text-white/70">
              {isOffline ? "Go online to load your jobs" : "No active jobs"}
            </p>
            {!isOffline && (
              <Link
                href="/dashboard/inspections/new"
                className="relative mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Start new inspection
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {activeJobs.map((insp) => (
              <li
                key={insp.id}
                className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.04] shadow-sm"
              >
                <Link
                  href={`/dashboard/inspections/${insp.id}/field`}
                  className="block p-4 transition-colors hover:bg-muted/30 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {insp.inspectionNumber}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            STATUS_COLOR[insp.status] ??
                              "text-muted-foreground",
                          )}
                        >
                          {insp.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {insp.propertyAddress}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden />
                          {formatInspectionDate(insp.inspectionDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Droplets className="h-3 w-3" aria-hidden />
                          {insp.moistureReadingCount} readings
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {insp.readyToLeave ? (
                        <CheckCircle2
                          className="h-5 w-5 text-emerald-500"
                          aria-label="Ready to leave"
                        />
                      ) : insp.criticalMissing > 0 ? (
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4" aria-hidden />
                          <span className="text-xs font-bold">
                            {insp.criticalMissing}
                          </span>
                        </div>
                      ) : null}
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                    </div>
                  </div>
                </Link>

                <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                  <Link
                    href={`/dashboard/inspections/${insp.id}/field`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-800 transition-colors hover:bg-cyan-500/15 dark:text-cyan-200"
                  >
                    <Droplets className="h-3 w-3" aria-hidden />
                    Readings
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/capture`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Camera className="h-3 w-3" aria-hidden />
                    Capture
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/voice`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Mic className="h-3 w-3" aria-hidden />
                    Voice
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/photos`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Camera className="h-3 w-3" aria-hidden />
                    Photos
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MobileNav />
    </DashboardPageFrame>
  );
}
