"use client";

import { useEffect, useState } from "react";
import { ChromeAlertTriangle, ChromeCheckCircle, ChromeSpinner } from "@/components/brand/chrome-icons";

type ClaimContextResponse = {
  data: {
    context: {
      stage: string;
      missingFields: string[];
      wetReadingCount: number;
    };
    completeness: {
      completionPercent: number;
      blocking: string[];
    };
  };
};

export function ClaimContextBanner({ inspectionId }: { inspectionId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ClaimContextResponse["data"] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/inspections/${inspectionId}/claim-context`);
        if (!res.ok) {
          throw new Error("Could not load claim context");
        }
        const json = (await res.json()) as ClaimContextResponse;
        if (!cancelled) setPayload(json.data);
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
  }, [inspectionId]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[120px] items-center gap-2 rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-600 shadow-sm">
        <ChromeSpinner className="h-4 w-4 animate-spin" />
        Loading claim readiness…
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="h-full min-h-[120px] rounded-xl border border-amber-200/80 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 shadow-sm">
        {error ?? "Claim context unavailable"}
      </div>
    );
  }

  const blocked = payload.completeness.blocking.length > 0;
  const Icon = blocked ? ChromeAlertTriangle : ChromeCheckCircle;

  return (
    <div
      className={`h-full min-h-[120px] rounded-xl border px-4 py-3 text-sm shadow-sm ${
        blocked
          ? "border-amber-300/80 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50"
          : "border-emerald-300/80 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Claim readiness {payload.completeness.completionPercent}% · stage{" "}
            {payload.context.stage}
          </p>
          {blocked ? (
            <p className="mt-1 text-xs opacity-90">
              Blocking: {payload.completeness.blocking.join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-xs opacity-90">
              Core intake complete. {payload.context.wetReadingCount} wet point(s)
              on latest readings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
