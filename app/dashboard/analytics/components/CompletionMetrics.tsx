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
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Loading metrics...</p>
          </div>
        </div>
      </div>
    )
  }

  const trendColor =
    trend === "improving"
      ? "text-emerald-400"
      : trend === "declining"
        ? "text-red-400"
        : "text-slate-400"

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
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Completion Time Overview</h3>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-slate-700/20 border border-slate-600 ${trendColor}`}>
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
            <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600/20">
              <p className="text-xs text-slate-400 mb-2">Average Days</p>
              <p className="text-2xl font-semibold">{overall.avgDays.toFixed(1)}</p>
              <p className="text-xs text-slate-400 mt-1">typical completion</p>
            </div>

            <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600/20">
              <p className="text-xs text-slate-400 mb-2">Median Days</p>
              <p className="text-2xl font-semibold">{overall.medianDays.toFixed(1)}</p>
              <p className="text-xs text-slate-400 mt-1">50% complete by</p>
            </div>

            <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600/20">
              <p className="text-xs text-slate-400 mb-2">95th Percentile</p>
              <p className="text-2xl font-semibold">{overall.p95Days.toFixed(1)}</p>
              <p className="text-xs text-slate-400 mt-1">max expected days</p>
            </div>

            <div className="p-4 rounded-lg bg-slate-700/20 border border-slate-600/20">
              <p className="text-xs text-slate-400 mb-2">Reports Analyzed</p>
              <p className="text-2xl font-semibold">{overall.totalReports}</p>
              <p className="text-xs text-slate-400 mt-1">in period</p>
            </div>
          </div>
        </div>
      )}

      {/* By Hazard Type */}
      {byHazardType && byHazardType.length > 0 && (
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold text-lg mb-4">Completion Time by Hazard Type</h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byHazardType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hazardType" stroke="#94a3b8" style={{ fontSize: "12px" }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: "12px" }} label={{ value: "Days", angle: -90, position: "insideLeft" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                }}
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
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/10 border border-slate-600/20 hover:bg-slate-700/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-400 min-w-[2rem]">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-slate-200">
                        {hazard.hazardType}
                      </p>
                      <p className="text-xs text-slate-400">
                        {hazard.count} reports
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-cyan-400">
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
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold text-lg mb-4">Completion Time Trend</h3>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                angle={timeSeries.length > 10 ? -45 : 0}
                textAnchor={timeSeries.length > 10 ? "end" : "middle"}
                height={timeSeries.length > 10 ? 80 : 30}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                label={{ value: "Days", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                }}
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
            <div className={`mt-4 p-3 rounded-lg flex gap-2 ${
              trend === "improving"
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-red-500/10 border border-red-500/20"
            }`}>
              <AlertCircle size={16} className={trend === "improving" ? "text-emerald-400" : "text-red-400"} />
              <p className={`text-sm ${trend === "improving" ? "text-emerald-300" : "text-red-300"}`}>
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
