"use client";

/**
 * Wave 2 (W2-2) — manager-facing drying snapshot (moisture + psych + env trend).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "@/lib/api-error-message";
import { formatDistanceToNow } from "date-fns";

type DryingSummary = {
  readingCount: number;
  monitoringPoints: number;
  latestMoistureLevel: number | null;
  latestMoistureAt: string | null;
  latestRh: number | null;
  latestDewPoint: number | null;
  latestDryBulbC: number | null;
  latestPsychAt: string | null;
  psychVisitCount: number;
};

type SnapshotResponse = {
  data: {
    summary: DryingSummary;
    psychVisitsWithEquipmentRunning: number;
  };
};

function fmtPct(value: number | null, suffix = "%") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}${suffix}`;
}

function fmtTemp(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}°C`;
}

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return null;
  }
}

export function DryingSnapshotPanel({
  inspectionId,
  className,
  compact,
}: {
  inspectionId: string;
  className?: string;
  /** Hide when no readings yet (overview cards). */
  compact?: boolean;
}) {
  const [summary, setSummary] = useState<DryingSummary | null>(null);
  const [equipmentVisits, setEquipmentVisits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/drying-snapshot`,
        { credentials: "include", cache: "no-store" },
      );
      const body = (await res.json().catch(() => ({}))) as SnapshotResponse & {
        error?: unknown;
      };
      if (!res.ok) {
        setSummary(null);
        setError(apiErrorMessage(body) ?? "Could not load drying snapshot");
        return;
      }
      setSummary(body.data.summary);
      setEquipmentVisits(body.data.psychVisitsWithEquipmentRunning ?? 0);
    } catch {
      setSummary(null);
      setError("Could not load drying snapshot — check your connection");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-neutral-50/80 dark:bg-slate-900/40 p-5",
          className,
        )}
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5" />
          <span className="text-sm text-neutral-600 dark:text-slate-400">
            Loading drying snapshot…
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 p-5 space-y-3",
          className,
        )}
      >
        <p className="text-sm text-neutral-600 dark:text-slate-400">{error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!summary) return null;

  const hasData =
    summary.readingCount > 0 ||
    summary.psychVisitCount > 0 ||
    summary.latestMoistureLevel != null;

  if (compact && !hasData) return null;

  return (
    <section
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-900/50 p-4 sm:p-5 space-y-4",
        className,
      )}
      aria-label="Drying snapshot"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
            Drying snapshot
          </h2>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/dashboard/inspections/${inspectionId}/monitoring`}>
            Full monitoring
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Latest moisture</p>
          <p className="text-lg font-semibold tabular-nums">
            {fmtPct(summary.latestMoistureLevel)}
          </p>
          {fmtWhen(summary.latestMoistureAt) && (
            <p className="text-[11px] text-neutral-500">{fmtWhen(summary.latestMoistureAt)}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Chamber RH</p>
          <p className="text-lg font-semibold tabular-nums">{fmtPct(summary.latestRh)}</p>
          {fmtWhen(summary.latestPsychAt) && (
            <p className="text-[11px] text-neutral-500">{fmtWhen(summary.latestPsychAt)}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Dew point</p>
          <p className="text-lg font-semibold tabular-nums">{fmtTemp(summary.latestDewPoint)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-slate-400">Dry bulb</p>
          <p className="text-lg font-semibold tabular-nums">{fmtTemp(summary.latestDryBulbC)}</p>
        </div>
      </div>

      <p className="text-xs text-neutral-600 dark:text-slate-400">
        {summary.readingCount} moisture reading
        {summary.readingCount === 1 ? "" : "s"}
        {summary.monitoringPoints > 0
          ? ` · ${summary.monitoringPoints} monitoring point${summary.monitoringPoints === 1 ? "" : "s"}`
          : ""}
        {summary.psychVisitCount > 0
          ? ` · ${summary.psychVisitCount} psych visit${summary.psychVisitCount === 1 ? "" : "s"}`
          : ""}
        {equipmentVisits > 0
          ? ` · equipment running on ${equipmentVisits} visit${equipmentVisits === 1 ? "" : "s"}`
          : ""}
      </p>
    </section>
  );
}