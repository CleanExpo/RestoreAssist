"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/operations/completeness-inbox");
        if (!res.ok) throw new Error("Could not load inbox");
        const json = await res.json();
        if (!cancelled) setRows(json.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Completeness inbox</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Open jobs with blocking intake gaps (read-only projections).
        </p>
      </header>

      {loading && (
        <p className="text-sm flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-slate-500">No blocking gaps on active jobs.</p>
      )}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.inspectionId}
            className="rounded-xl border border-slate-200 dark:border-slate-700 p-4"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/inspections/${row.inspectionId}`}
                  className="font-medium text-brand-navy hover:underline"
                >
                  {row.inspectionNumber ?? row.inspectionId}
                </Link>
                <p className="text-xs text-slate-500 truncate">{row.propertyAddress}</p>
                <p className="text-xs mt-1">
                  {row.completionPercent}% complete · {row.status.replaceAll("_", " ")}
                </p>
                <p className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                  Blocking: {row.blocking.join(", ")}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
