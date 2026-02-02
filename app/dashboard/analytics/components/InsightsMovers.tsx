"use client"

import { TrendingUp, Clock, Zap, Loader2, Target } from "lucide-react"
import { cn } from "@/lib/utils"

interface TopGrowingClient {
  name: string
  currentRevenue: number
  currentReports: number
  revenueChangePct: number
  reportChangePct: number
}

interface HazardTurnaround {
  hazard: string
  avgHours: number
  count: number
}

interface InsightsMoversProps {
  topGrowingClients: TopGrowingClient[]
  slowestHazards: HazardTurnaround[]
  fastestHazards: HazardTurnaround[]
  loading?: boolean
}

export default function InsightsMovers({
  topGrowingClients = [],
  slowestHazards = [],
  fastestHazards = [],
  loading = false,
}: InsightsMoversProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[320px] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      </div>
    )
  }

  const hasData = topGrowingClients.length > 0 || slowestHazards.length > 0 || fastestHazards.length > 0
  if (!hasData) {
    return (
      <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="flex items-center gap-3 mb-4">
          <Target className="w-5 h-5 text-rose-500" />
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            Top Movers & Turnaround
          </h3>
        </div>
        <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
          No growth or turnaround data for this period. More reports will surface top growing clients and hazard turnaround times.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30", "hover:border-rose-500/30")}>
      <div className="flex items-center gap-3 mb-6">
        <Target className="w-5 h-5 text-rose-500" />
        <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
          Top Movers & Turnaround
        </h3>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {/* Top growing clients */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>Top growing clients</span>
          </div>
          <ul className="space-y-2">
            {topGrowingClients.slice(0, 5).map((c, i) => (
              <li key={i} className={cn("flex items-center justify-between text-sm py-1.5 px-2 rounded-lg", "bg-neutral-50 dark:bg-slate-700/30")}>
                <span className={cn("font-medium truncate max-w-[140px]", "text-neutral-800 dark:text-slate-200")} title={c.name}>{c.name}</span>
                <span className={cn("font-semibold shrink-0", c.revenueChangePct >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {c.revenueChangePct >= 0 ? "+" : ""}{c.revenueChangePct}%
                </span>
              </li>
            ))}
          </ul>
          {topGrowingClients.length === 0 && (
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>No client growth data</p>
          )}
        </div>
        {/* Slowest turnaround */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>Slowest turnaround</span>
          </div>
          <ul className="space-y-2">
            {slowestHazards.slice(0, 5).map((h, i) => (
              <li key={i} className={cn("flex items-center justify-between text-sm py-1.5 px-2 rounded-lg", "bg-neutral-50 dark:bg-slate-700/30")}>
                <span className={cn("font-medium", "text-neutral-800 dark:text-slate-200")}>{h.hazard}</span>
                <span className="text-amber-500 font-semibold">{h.avgHours.toFixed(1)}h</span>
              </li>
            ))}
          </ul>
          {slowestHazards.length === 0 && (
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>No completion data</p>
          )}
        </div>
        {/* Fastest turnaround */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-cyan-500" />
            <span className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>Fastest turnaround</span>
          </div>
          <ul className="space-y-2">
            {fastestHazards.slice(0, 5).map((h, i) => (
              <li key={i} className={cn("flex items-center justify-between text-sm py-1.5 px-2 rounded-lg", "bg-neutral-50 dark:bg-slate-700/30")}>
                <span className={cn("font-medium", "text-neutral-800 dark:text-slate-200")}>{h.hazard}</span>
                <span className="text-cyan-500 font-semibold">{h.avgHours.toFixed(1)}h</span>
              </li>
            ))}
          </ul>
          {fastestHazards.length === 0 && (
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>No completion data</p>
          )}
        </div>
      </div>
    </div>
  )
}
