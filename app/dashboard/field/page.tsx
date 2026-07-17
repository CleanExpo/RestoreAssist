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

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/mobile/MobileNav";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import {
  cacheJobs,
  getCachedJobs,
  type CachedJob,
} from "@/lib/offline/job-cache";
import { isCapacitor } from "@/lib/capacitor";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-white/50",
  SUBMITTED: "text-amber-400",
  PROCESSING: "text-blue-400",
  CLASSIFIED: "text-purple-400",
  SCOPED: "text-cyan-400",
  COMPLETED: "text-success",
};

function formatInspectionDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

export default function FieldDashboardPage() {
  const [inspections, setInspections] = useState<CachedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("Good morning");
  const [isOffline, setIsOffline] = useState(false);
  const [cacheAge, setCacheAge] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Greeting
  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 17) setGreeting("Good afternoon");
    else if (h >= 17) setGreeting("Good evening");
  }, []);

  // Network status listener (Capacitor native — proactive offline detection)
  useEffect(() => {
    if (!isCapacitor()) return;
    let cleanup: (() => void) | undefined;
    import("@capacitor/network")
      .then(({ Network }) => {
        // Seed initial state
        Network.getStatus().then(({ connected }) => setIsOffline(!connected));
        // Listen for changes
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

  async function loadInspections() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        "/api/inspections?status=DRAFT,SUBMITTED,PROCESSING,CLASSIFIED,SCOPED&take=10",
      );
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
        inspectionDate: string;
        moistureReadings?: unknown[];
      }>;

      // Enrich with checklist status — best-effort, never blocks the list
      const enriched = await Promise.all(
        items.map(async (insp) => {
          try {
            const clRes = await fetch(
              `/api/inspections/${insp.id}/voice/checklist`,
            );
            const cl = clRes.ok
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

      setInspections(enriched);
      setFromCache(false);
      setCacheAge(null);
      setIsOffline(false);
      // Persist to IndexedDB for offline fallback
      await cacheJobs(enriched);
    } catch (err) {
      const isHttpError =
        err instanceof Error &&
        "isHttpError" in err &&
        (err as { isHttpError?: boolean }).isHttpError;

      if (isHttpError) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load jobs",
        );
        setIsOffline(false);
      } else {
        // Network failure — fall back to IndexedDB cache
        const { jobs, fetchedAt } = await getCachedJobs();
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
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInspections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeJobs = inspections.filter((i) =>
    ["DRAFT", "SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED"].includes(
      i.status,
    ),
  );
  const nextJob = activeJobs[0];

  return (
    <div className="min-h-screen bg-brand-canvas text-white pb-24">
      {/* Offline / cached-data banner */}
      {(isOffline || fromCache) && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/20 text-amber-300 text-xs">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {isOffline
              ? fromCache && cacheAge
                ? `Offline — showing snapshot from ${cacheAge}`
                : "Offline — connect to load jobs"
              : cacheAge
                ? `Cached snapshot from ${cacheAge}`
                : "Showing cached data"}
          </span>
          {!isOffline && (
            <button
              type="button"
              onClick={loadInspections}
              className="text-amber-300/70 hover:text-amber-200"
              aria-label="Refresh job list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {loadError && !isOffline && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 border-b border-red-500/20 text-red-300 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Could not load jobs — {loadError}</span>
          <button
            type="button"
            onClick={() => void loadInspections()}
            className="text-red-300/80 hover:text-red-200"
            aria-label="Retry loading jobs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <p className="text-white/50 text-sm">{greeting}</p>
        <h1 className="text-2xl font-bold text-white">Field Dashboard</h1>
        <p className="text-white/40 text-sm mt-0.5">
          {loading
            ? "Loading…"
            : `${activeJobs.length} active job${activeJobs.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Quick actions */}
      <div className="px-4 mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {nextJob ? (
            <Link
              href={`/dashboard/inspections/${nextJob.id}/field`}
              className="flex items-center justify-between rounded-2xl bg-brand-navy px-4 py-4 text-white transition-all active:scale-95"
            >
              <span>
                <span className="block text-sm font-semibold">
                  Continue next job
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/60">
                  {nextJob.propertyAddress}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-white/60" />
            </Link>
          ) : (
            <div className="rounded-2xl bg-white/5 px-4 py-4 text-sm text-white/50">
              No active jobs ready yet.
            </div>
          )}
          <Link
            href="/dashboard/inspections/new"
            className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-4 text-sm font-medium text-white transition-all active:scale-95"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Start new job
            </span>
            <ChevronRight className="h-5 w-5 text-white/30" />
          </Link>
        </div>
      </div>

      {/* Active jobs */}
      <div id="active" className="px-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-white/40 uppercase tracking-wider">
            Active jobs
          </p>
          <div className="flex items-center gap-3">
            {!loading && !isOffline && (
              <button
                type="button"
                onClick={loadInspections}
                aria-label="Refresh job list"
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            <Link
              href="/dashboard/inspections"
              className="text-xs text-brand-gold"
            >
              All jobs
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-5 w-5 text-white/30 animate-spin" />
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/30 text-sm mb-4">
              {isOffline ? "Go online to load your jobs" : "No active jobs"}
            </p>
            {!isOffline && (
              <Link
                href="/dashboard/inspections/new"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-brand-navy text-white text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Start new inspection
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((insp) => (
              <Link
                key={insp.id}
                href={`/dashboard/inspections/${insp.id}/field`}
                className="block bg-white/5 rounded-2xl p-4 hover:bg-white/8 active:scale-[0.98] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-white/40">
                        {insp.inspectionNumber}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          STATUS_COLOR[insp.status],
                        )}
                      >
                        {insp.status}
                      </span>
                    </div>
                    <p className="font-medium text-white text-sm leading-snug">
                      {insp.propertyAddress}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatInspectionDate(insp.inspectionDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Droplets className="h-3 w-3" />
                        {insp.moistureReadingCount} readings
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {insp.readyToLeave ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : insp.criticalMissing > 0 ? (
                      <div className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-bold">
                          {insp.criticalMissing}
                        </span>
                      </div>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-white/20" />
                  </div>
                </div>

                {/* Field shortcuts */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                  <Link
                    href={`/dashboard/inspections/${insp.id}/field`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-navy/60 text-xs text-white/70 hover:bg-brand-navy active:scale-95 transition-all"
                  >
                    <Droplets className="h-3 w-3" />
                    Readings
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/voice`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <Mic className="h-3 w-3" />
                    Voice
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/photos`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <Camera className="h-3 w-3" />
                    Photos
                  </Link>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <MobileNav />
    </div>
  );
}
