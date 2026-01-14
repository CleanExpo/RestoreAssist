"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
} from "recharts"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectionData {
  date: string
  revenue: number
  isProjected: boolean
  confidence?: number
}

interface RevenueProjectionProps {
  historical: Array<{ date: string; revenue: number }>
  projected: ProjectionData[]
  trend?: "improving" | "stable" | "declining"
  loading?: boolean
}

export default function RevenueProjection({
  historical,
  projected,
  trend = "stable",
  loading = false,
}: RevenueProjectionProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Calculating projections...</p>
          </div>
        </div>
      </div>
    )
  }

  const combinedData = [
    ...historical.map((d) => ({ ...d, type: "historical" })),
    ...projected.map((d) => ({ ...d, type: "projected" })),
  ]

  if (!combinedData || combinedData.length === 0) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>30/60/90 Day Revenue Forecast</h3>
        <div className={cn("flex items-center justify-center h-[300px]", "text-neutral-600 dark:text-slate-400")}>
          Not enough historical data for projection
        </div>
      </div>
    )
  }

  const trendColor =
    trend === "improving"
      ? "#10b981"
      : trend === "declining"
        ? "#f97316"
        : "#8b5cf6"

  const trendLabel =
    trend === "improving"
      ? "📈 Improving"
      : trend === "declining"
        ? "📉 Declining"
        : "→ Stable"

  return (
    <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={cn("font-semibold text-lg", "text-neutral-900 dark:text-slate-200")}>30/60/90 Day Revenue Forecast</h3>
        <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full border", "bg-neutral-100 dark:bg-slate-700/20", "border-neutral-300 dark:border-slate-600")}>
          <span style={{ color: trendColor }} className="text-sm font-medium">
            {trendLabel}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={combinedData}>
          <defs>
            <linearGradient id="colorHistorical" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient
              id="colorProjected"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
          <XAxis
            dataKey="date"
            className="text-neutral-600 dark:text-slate-400"
            style={{ fontSize: "12px" }}
            angle={combinedData.length > 15 ? -45 : 0}
            textAnchor={combinedData.length > 15 ? "end" : "middle"}
            height={combinedData.length > 15 ? 80 : 30}
          />
          <YAxis className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(255 255 255 / 0.95)",
              border: "1px solid rgb(229 231 235)",
              borderRadius: "8px",
              color: "#111827",
            }}
            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            formatter={(value: any) => `$${(value as number).toLocaleString()}`}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend />

          {/* Historical data */}
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#3b82f6"
            fill="url(#colorHistorical)"
            name="Historical Revenue"
            data={combinedData.filter((d) => d.type === "historical")}
            isAnimationActive={false}
          />

          {/* Projected data with different styling */}
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#06b6d4"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Projected Revenue"
            data={combinedData.filter((d) => d.type === "projected")}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Projection Summary */}
      <div className={cn("mt-6 grid grid-cols-3 gap-4 p-4 rounded-lg border", "bg-neutral-50 dark:bg-slate-700/10", "border-neutral-200 dark:border-slate-600/20")}>
        <div>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>30-Day Projection</p>
          <p className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">
            ${(projected.slice(0, 30).reduce((sum, p) => sum + p.revenue, 0) || 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>60-Day Projection</p>
          <p className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">
            ${(projected.slice(0, 60).reduce((sum, p) => sum + p.revenue, 0) || 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>90-Day Projection</p>
          <p className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">
            ${(projected.slice(0, 90).reduce((sum, p) => sum + p.revenue, 0) || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <p className={cn("text-xs mt-4", "text-neutral-600 dark:text-slate-400")}>
        Projections are based on linear regression analysis of historical data.
        Confidence decreases as predictions extend further into the future.
      </p>
    </div>
  )
}
