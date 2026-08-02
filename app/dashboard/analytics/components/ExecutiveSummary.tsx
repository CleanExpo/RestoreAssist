"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutiveSummaryProps {
  summary: string;
  periodLabel?: string;
  loading?: boolean;
}

export default function ExecutiveSummary({
  summary,
  periodLabel = "Selected period",
  loading = false,
}: ExecutiveSummaryProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "rounded-2xl p-6 animate-pulse",
          "bg-white dark:bg-slate-900/50 border border-neutral-200 dark:border-slate-700/60",
        )}
      >
        <div
          className={cn(
            "h-4 rounded w-1/3 mb-4",
            "bg-muted",
          )}
        />
        <div
          className={cn(
            "h-3 rounded w-full mb-2",
            "bg-muted",
          )}
        />
        <div
          className={cn(
            "h-3 rounded w-4/5 mb-2",
            "bg-muted",
          )}
        />
        <div
          className={cn(
            "h-3 rounded w-2/3",
            "bg-muted",
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl p-6 transition-colors",
        "bg-white dark:bg-slate-900/50 border border-neutral-200 dark:border-slate-700/60",
        "hover:border-ring/60",
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-muted">
          <Sparkles className="w-5 h-5 text-info" />
        </div>
        <div>
          <h3
            className={cn(
              "text-lg font-semibold",
              "text-foreground",
            )}
          >
            Executive Summary
          </h3>
          {periodLabel && (
            <p
              className={cn("text-xs", "text-muted-foreground")}
            >
              {periodLabel}
            </p>
          )}
        </div>
      </div>
      <p
        className={cn(
          "text-sm leading-relaxed",
          "text-foreground/90",
        )}
      >
        {summary ||
          "No summary available for this period. Add more reports to see insights."}
      </p>
    </div>
  );
}
