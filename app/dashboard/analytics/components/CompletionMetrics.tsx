"use client"

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts"
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface HazardMetric {
  hazardType: string
  avgDays: number
  count: number
}

interface TimeSeriesPoint {
  date: string
  avgCompletionDays: number
}

interface CompletionMetricsProps {
  overall?: {
    avgDays: number
    medianDays: number
    p95Days: number
    totalReports: number
  }
  byHazardType?: HazardMetric[]
  timeSeries?: TimeSeriesPoint[]
  trend?: "improving" | "stable" | "declining"
  loading?: boolean
}

export default function CompletionMetrics({
  overall,
  byHazardType = [],
  timeSeries = [],
  trend = "stable",
  loading = false,
}: CompletionMetricsProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Loading metrics...</p>
          </div>
        </div>
      </div>
    )
  }

  const trendColor =
    trend === "improving"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "declining"
        ? "text-red-600 dark:text-red-400"
        : "text-neutral-600 dark:text-slate-400"

  const trendIcon =
    trend === "improving" ? (
      <TrendingUp size={16} />
    ) : trend === "declining" ? (
      <TrendingDown size={16} />
    ) : null

  return (
    <div className="space-y-6">
      {/* Overall Metrics */}
      {overall && (
        <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn("font-semibold text-lg", "text-neutral-900 dark:text-slate-200")}>Completion Time Overview</h3>
            <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full border", "bg-neutral-100 dark:bg-slate-700/20", "border-neutral-300 dark:border-slate-600", trendColor)}>
              {trendIcon}
              <span className="text-sm font-medium capitalize">
                {trend === "improving"
                  ? "Getting faster"
                  : trend === "declining"
                    ? "Getting slower"
                    : "Stable"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={cn("p-4 rounded-lg border", "bg-neutral-50 dark:bg-slate-700/20", "border-neutral-200 dark:border-slate-600/20")}>
              <p className={cn("text-xs mb-2", "text-neutral-600 dark:text-slate-400")}>Average Days</p>
              <p className={cn("text-2xl font-semibold", "text-neutral-900 dark:text-slate-200")}>{overall.avgDays.toFixed(1)}</p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>typical completion</p>
            </div>

            <div className={cn("p-4 rounded-lg border", "bg-neutral-50 dark:bg-slate-700/20", "border-neutral-200 dark:border-slate-600/20")}>
              <p className={cn("text-xs mb-2", "text-neutral-600 dark:text-slate-400")}>Median Days</p>
              <p className={cn("text-2xl font-semibold", "text-neutral-900 dark:text-slate-200")}>{overall.medianDays.toFixed(1)}</p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>50% complete by</p>
            </div>

            <div className={cn("p-4 rounded-lg border", "bg-neutral-50 dark:bg-slate-700/20", "border-neutral-200 dark:border-slate-600/20")}>
              <p className={cn("text-xs mb-2", "text-neutral-600 dark:text-slate-400")}>95th Percentile</p>
              <p className={cn("text-2xl font-semibold", "text-neutral-900 dark:text-slate-200")}>{overall.p95Days.toFixed(1)}</p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>max expected days</p>
            </div>

            <div className={cn("p-4 rounded-lg border", "bg-neutral-50 dark:bg-slate-700/20", "border-neutral-200 dark:border-slate-600/20")}>
              <p className={cn("text-xs mb-2", "text-neutral-600 dark:text-slate-400")}>Reports Analyzed</p>
              <p className={cn("text-2xl font-semibold", "text-neutral-900 dark:text-slate-200")}>{overall.totalReports}</p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>in period</p>
            </div>
          </div>
        </div>
      )}

      {/* By Hazard Type */}
      {byHazardType && byHazardType.length > 0 && (
        <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
          <h3 className={cn("font-semibold text-lg mb-4", "text-neutral-900 dark:text-slate-200")}>Completion Time by Hazard Type</h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byHazardType}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
              <XAxis dataKey="hazardType" className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
              <YAxis className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} label={{ value: "Days", angle: -90, position: "insideLeft", style: { textAnchor: 'middle', fill: 'rgb(75 85 99)' } }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(255 255 255 / 0.95)",
                  border: "1px solid rgb(229 231 235)",
                  borderRadius: "8px",
                  color: "#111827",
                }}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                formatter={(value: any) => [`${(value as number).toFixed(1)} days`, "Avg Time"]}
              />
              <Legend />
              <Bar dataKey="avgDays" fill="#f59e0b" name="Average Days" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Hazard type list with rankings */}
          <div className="mt-6 space-y-2">
            {byHazardType
              .sort((a, b) => a.avgDays - b.avgDays)
              .map((hazard, index) => (
                <div
                  key={hazard.hazardType}
                  className={cn("flex items-center justify-between p-3 rounded-lg border transition-colors", "bg-neutral-50 dark:bg-slate-700/10", "border-neutral-200 dark:border-slate-600/20", "hover:bg-neutral-100 dark:hover:bg-slate-700/20")}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("text-sm font-semibold min-w-[2rem]", "text-neutral-600 dark:text-slate-400")}>
                      #{index + 1}
                    </span>
                    <div>
                      <p className={cn("font-medium", "text-neutral-900 dark:text-slate-200")}>
                        {hazard.hazardType}
                      </p>
                      <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
                        {hazard.count} reports
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-cyan-600 dark:text-cyan-400">
                      {hazard.avgDays.toFixed(1)} days
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Time Series Trend */}
      {timeSeries && timeSeries.length > 0 && (
        <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
          <h3 className={cn("font-semibold text-lg mb-4", "text-neutral-900 dark:text-slate-200")}>Completion Time Trend</h3>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
              <XAxis
                dataKey="date"
                className="text-neutral-600 dark:text-slate-400"
                style={{ fontSize: "12px" }}
                angle={timeSeries.length > 10 ? -45 : 0}
                textAnchor={timeSeries.length > 10 ? "end" : "middle"}
                height={timeSeries.length > 10 ? 80 : 30}
              />
              <YAxis
                className="text-neutral-600 dark:text-slate-400"
                style={{ fontSize: "12px" }}
                label={{ value: "Days", angle: -90, position: "insideLeft", style: { textAnchor: 'middle', fill: 'rgb(75 85 99)' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(255 255 255 / 0.95)",
                  border: "1px solid rgb(229 231 235)",
                  borderRadius: "8px",
                  color: "#111827",
                }}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                formatter={(value: any) =>
                  `${(value as number).toFixed(1)} days`
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="avgCompletionDays"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                name="Avg Completion Days"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Insight */}
          {trend !== "stable" && (
            <div className={cn("mt-4 p-3 rounded-lg flex gap-2 border", 
              trend === "improving"
                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"
            )}>
              <AlertCircle size={16} className={trend === "improving" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
              <p className={cn("text-sm", trend === "improving" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                {trend === "improving"
                  ? "Great progress! Your completion times are getting faster."
                  : "Your completion times are increasing. Consider reviewing your workflow."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
