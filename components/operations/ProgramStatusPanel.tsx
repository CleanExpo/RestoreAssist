"use client";

/**
 * Wave 5 (W5-3) — program waves + live stall/integration metrics.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiErrorMessage } from "@/lib/api-error-message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ProgramStatusResponse = {
  waves: Array<{
    wave: string;
    label: string;
    status: string;
    openItems: string[];
  }>;
  operations: {
    stallSummary: {
      totalStalled: number;
      byAge: { fresh: number; ageing: number; stale: number };
      maxDaysIdle: number;
    };
    integrationFailures: {
      failedSyncsLast7d: number;
      webhookDeadLetter: number;
    };
  };
  slo?: {
    targets: { p95LatencyMs: number; errorRateMax: number };
    lastRun: {
      ranAt: string;
      pass: boolean;
      p95Ms: number;
      errorRate: number;
    } | null;
  };
  links: {
    syncErrors: string;
    integrationHealth: string;
    auditExport?: string;
  };
};

export function ProgramStatusPanel({ className }: { className?: string }) {
  const [data, setData] = useState<ProgramStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/program-status", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(null);
        setError(apiErrorMessage(body) ?? "Could not load program status");
        return;
      }
      setData(body as ProgramStatusResponse);
    } catch {
      setData(null);
      setError("Could not load program status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className={cn("rounded-xl border p-4", className)} aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Loading program status…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border p-4 space-y-2", className)}>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const stall = data.operations.stallSummary;
  const failures = data.operations.integrationFailures;
  const wave5 = data.waves.find((w) => w.wave === "5");

  return (
    <section
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-900/50 p-4 sm:p-5 space-y-4",
        className,
      )}
      aria-label="Program status"
    >
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
          Full functionality program
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {wave5?.label ?? "Operations"} — waves 0–4 shipped; stall and connector
          metrics below.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-muted-foreground">Stalled jobs</p>
          <p className="text-lg font-semibold tabular-nums">{stall.totalStalled}</p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-muted-foreground">Stale (7d+)</p>
          <p className="text-lg font-semibold tabular-nums">{stall.byAge.stale}</p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-muted-foreground">Sync failures (7d)</p>
          <p className="text-lg font-semibold tabular-nums">
            {failures.failedSyncsLast7d}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-muted-foreground">Webhook dead-letter</p>
          <p className="text-lg font-semibold tabular-nums">
            {failures.webhookDeadLetter}
          </p>
        </div>
      </div>

      {(failures.failedSyncsLast7d > 0 || failures.webhookDeadLetter > 0) && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Connector issues need attention —{" "}
          <Link
            href={data.links.syncErrors}
            className="underline font-medium"
          >
            open sync errors
          </Link>{" "}
          or{" "}
          <Link
            href={data.links.integrationHealth}
            className="underline font-medium"
          >
            integration health
          </Link>
          .
        </p>
      )}

      {stall.maxDaysIdle >= 7 && (
        <p className="text-xs text-muted-foreground">
          Longest idle stalled job: {stall.maxDaysIdle} days — prioritise inbox
          triage.
        </p>
      )}

      {data.slo && (
        <div className="rounded-lg border border-dashed p-3 text-xs space-y-1">
          <p className="font-medium text-neutral-800 dark:text-slate-200">
            SLO probe (/api/health)
          </p>
          <p className="text-muted-foreground">
            Target p95 ≤ {data.slo.targets.p95LatencyMs} ms, error rate ≤{" "}
            {(data.slo.targets.errorRateMax * 100).toFixed(1)}%
          </p>
          {data.slo.lastRun ? (
            <p
              className={cn(
                data.slo.lastRun.pass
                  ? "text-emerald-800 dark:text-emerald-200"
                  : "text-amber-800 dark:text-amber-200",
              )}
            >
              Last run {new Date(data.slo.lastRun.ranAt).toLocaleString()}: p95{" "}
              {Math.round(data.slo.lastRun.p95Ms)} ms —{" "}
              {data.slo.lastRun.pass ? "pass" : "fail"}
            </p>
          ) : (
            <p className="text-muted-foreground">
              No harness run yet —{" "}
              <code className="text-[10px]">pnpm exec tsx scripts/slo-load-harness.ts</code>
            </p>
          )}
        </div>
      )}

      {data.links.auditExport && (
        <p className="text-xs text-muted-foreground">
          Compliance export:{" "}
          <a
            href={data.links.auditExport}
            className="underline font-medium"
          >
            download org audit CSV
          </a>
          {" "}
          (managers, last 500 events)
        </p>
      )}
    </section>
  );
}