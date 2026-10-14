"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import {
  completenessBlockerAction,
  completenessBlockerHref,
  completenessBlockerLabel,
} from "@/lib/dashboard/completeness-blocker-links";
import { workspaceHubLinks } from "@/lib/dashboard/workspace-secondary-links";

type Row = {
  inspectionId: string;
  inspectionNumber: string | null;
  propertyAddress: string;
  status: string;
  completionPercent: number;
  blocking: string[];
};

export default function CompletenessInboxPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DashboardListPageHeader
        title="Completeness inbox"
        description="Active jobs with blocking intake gaps — open the job to fix what's missing."
        primaryAction={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 sm:w-auto"
          >
            {loading ? "Refreshing…" : "Refresh list"}
          </button>
        }
        secondaryLinks={workspaceHubLinks({
          omitHref: "/dashboard/operations/completeness-inbox",
        })}
      />

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading open jobs…
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-300"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 rounded-lg border border-red-500/40 px-4 font-medium"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No blocking gaps on active jobs — your team is caught up.
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.inspectionId}
            className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/inspections/${row.inspectionId}`}
                  className="font-medium text-brand-navy hover:underline dark:text-cyan-400"
                >
                  {row.propertyAddress ||
                    row.inspectionNumber ||
                    "Open job"}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.inspectionNumber} · {row.status} ·{" "}
                  {row.completionPercent}% complete
                </p>
                {row.blocking.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {row.blocking.map((item) => (
                      <li
                        key={item}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400"
                      >
                        <span>{completenessBlockerLabel(item)}</span>
                        <Link
                          href={completenessBlockerHref(
                            row.inspectionId,
                            item,
                          )}
                          className="inline-flex min-h-9 items-center rounded-lg border border-cyan-500/40 px-3 text-xs font-medium text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300"
                        >
                          {completenessBlockerAction(item)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
