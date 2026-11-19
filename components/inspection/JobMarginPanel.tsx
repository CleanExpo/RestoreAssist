"use client";

/**
 * Wave 4 (W4-2) — owner/manager job margin snapshot.
 */

import { useCallback, useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";

type MarginData = {
  labourExGst: number;
  equipmentExGst: number;
  materialsExGst: number;
  otherExGst: number;
  estimateTotalExGst: number;
  invoicedSubtotalExGst: number | null;
  marginExGst: number | null;
  marginPercent: number | null;
};

function fmtAud(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function JobMarginPanel({
  inspectionId,
  className,
}: {
  inspectionId: string;
  className?: string;
}) {
  const [data, setData] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/job-margin`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(null);
        setError(apiErrorMessage(body) ?? "Could not load job margin");
        return;
      }
      setData(body.data as MarginData);
    } catch {
      setData(null);
      setError("Could not load job margin — check your connection");
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
          "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 p-5",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5" />
          <span className="text-sm text-neutral-600 dark:text-slate-400">
            Loading job margin…
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

  if (!data) return null;

  return (
    <section
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-900/50 p-4 sm:p-5 space-y-4",
        className,
      )}
      aria-label="Job margin"
    >
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
          Job margin
        </h2>
      </div>
      <p className="text-xs text-neutral-600 dark:text-slate-400">
        Estimate breakdown vs latest issued invoice (ex GST). Margin is invoice
        subtotal minus estimate total.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-neutral-500">Labour</p>
          <p className="font-semibold tabular-nums">{fmtAud(data.labourExGst)}</p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-neutral-500">Equipment</p>
          <p className="font-semibold tabular-nums">
            {fmtAud(data.equipmentExGst)}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-neutral-500">Estimate total</p>
          <p className="font-semibold tabular-nums">
            {fmtAud(data.estimateTotalExGst)}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3">
          <p className="text-xs text-neutral-500">Invoiced</p>
          <p className="font-semibold tabular-nums">
            {fmtAud(data.invoicedSubtotalExGst)}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 dark:bg-slate-900/40 p-3 sm:col-span-2">
          <p className="text-xs text-neutral-500">Margin</p>
          <p className="font-semibold tabular-nums">
            {fmtAud(data.marginExGst)}
            {data.marginPercent != null && (
              <span className="text-xs font-normal text-neutral-500 ml-2">
                ({data.marginPercent.toFixed(1)}%)
              </span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}