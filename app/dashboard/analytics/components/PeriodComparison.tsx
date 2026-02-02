"use client"

import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface PeriodComparisonData {
  current: { reports: number; revenue: number }
  previous: { reports: number; revenue: number }
  changes: { reports: string; revenue: string }
}

interface PeriodComparisonProps {
  data: PeriodComparisonData | null
  currentLabel?: string
  previousLabel?: string
  loading?: boolean
}

export default function PeriodComparison({
  data,
  currentLabel = "This period",
  previousLabel = "Previous period",
  loading = false,
}: PeriodComparisonProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-2xl border animate-pulse", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className={cn("h-5 rounded w-1/3 mb-6", "bg-neutral-200 dark:bg-slate-700")} />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={cn("h-16 rounded", "bg-neutral-200 dark:bg-slate-700")} />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("text-lg font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>
          Period comparison
        </h3>
        <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
          No comparison data available.
        </p>
      </div>
    )
  }

  const revenueChange = data.changes.revenue
  const reportsChange = data.changes.reports
  const revenueUp = revenueChange.startsWith("+") && revenueChange !== "+0%"
  const revenueDown = revenueChange.startsWith("-")
  const reportsUp = reportsChange.startsWith("+") && reportsChange !== "+0%"
  const reportsDown = reportsChange.startsWith("-")

  return (
    <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30", "hover:border-amber-500/30")}>
      <h3 className={cn("text-lg font-semibold mb-6", "text-neutral-900 dark:text-slate-200")}>
        Period comparison
      </h3>
      <div className="grid grid-cols-3 gap-4 items-center">
        <div className={cn("rounded-xl p-4", "bg-neutral-100 dark:bg-slate-700/50")}>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>{previousLabel}</p>
          <p className={cn("text-xl font-bold", "text-neutral-900 dark:text-slate-200")}>{data.previous.reports}</p>
          <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>reports</p>
          <p className={cn("text-sm font-semibold mt-1", "text-neutral-700 dark:text-slate-300")}>
            ${(data.previous.revenue / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2">
          <ArrowRight className="w-5 h-5 text-amber-500" />
          <div className="flex flex-col items-center gap-1">
            <span className={cn("text-xs font-medium", reportsUp ? "text-emerald-500" : reportsDown ? "text-red-500" : "text-neutral-500")}>
              {reportsChange} reports
            </span>
            <span className={cn("text-xs font-medium", revenueUp ? "text-emerald-500" : revenueDown ? "text-red-500" : "text-neutral-500")}>
              {revenueChange} revenue
            </span>
          </div>
        </div>
        <div className={cn("rounded-xl p-4", "bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30")}>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>{currentLabel}</p>
          <p className={cn("text-xl font-bold", "text-neutral-900 dark:text-slate-200")}>{data.current.reports}</p>
          <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>reports</p>
          <p className={cn("text-sm font-semibold mt-1", "text-amber-600 dark:text-amber-400")}>
            ${(data.current.revenue / 1000).toFixed(1)}K
          </p>
        </div>
      </div>
      <div className={cn("mt-4 pt-4 border-t flex justify-center gap-6", "border-neutral-200 dark:border-slate-700/50")}>
        <div className="flex items-center gap-2">
          {reportsUp ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : reportsDown ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4 text-neutral-500" />}
          <span className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Reports {data.changes.reports}</span>
        </div>
        <div className="flex items-center gap-2">
          {revenueUp ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : revenueDown ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4 text-neutral-500" />}
          <span className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Revenue {data.changes.revenue}</span>
        </div>
      </div>
    </div>
  )
}
