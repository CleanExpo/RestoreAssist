"use client"

import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface ExecutiveSummaryProps {
  summary: string
  periodLabel?: string
  loading?: boolean
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
          "bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10",
          "border border-indigo-500/20 dark:border-indigo-400/20"
        )}
      >
        <div className={cn("h-4 rounded w-1/3 mb-4", "bg-neutral-200 dark:bg-slate-700")} />
        <div className={cn("h-3 rounded w-full mb-2", "bg-neutral-200 dark:bg-slate-700")} />
        <div className={cn("h-3 rounded w-4/5 mb-2", "bg-neutral-200 dark:bg-slate-700")} />
        <div className={cn("h-3 rounded w-2/3", "bg-neutral-200 dark:bg-slate-700")} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-2xl p-6 backdrop-blur-sm transition-all duration-300",
        "bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10",
        "border border-indigo-500/20 dark:border-indigo-400/20",
        "hover:border-indigo-500/40 dark:hover:border-indigo-400/40"
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-indigo-500/20">
          <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            Executive Summary
          </h3>
          {periodLabel && (
            <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>{periodLabel}</p>
          )}
        </div>
      </div>
      <p className={cn("text-sm leading-relaxed", "text-neutral-700 dark:text-slate-300")}>
        {summary || "No summary available for this period. Add more reports to see insights."}
      </p>
    </div>
  )
}
