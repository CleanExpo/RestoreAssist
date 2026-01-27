"use client"

import { useState, useEffect } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
} from "recharts"
import { Loader2, TrendingUp, TrendingDown, Calendar, Target, Award, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface MonthlyData {
  month: string
  monthLabel: string
  reports: number
  revenue: number
  completed: number
  pending: number
}

interface Summary {
  totalReports: number
  totalRevenue: number
  avgMonthlyReports: number
  avgMonthlyRevenue: number
  growthRate: number
  bestMonth: { label: string; reports: number } | null
  worstMonth: { label: string; reports: number } | null
  ytd: { reports: number; revenue: number }
}

interface MonthlyVolumeChartProps {
  userId?: string
  months?: number
}

export default function MonthlyVolumeChart({
  userId,
  months = 12,
}: MonthlyVolumeChartProps) {
  const [data, setData] = useState<MonthlyData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"reports" | "revenue">("reports")

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const url = new URL("/api/analytics/monthly-volume", window.location.origin)
        url.searchParams.set("months", String(months))
        if (userId) url.searchParams.set("userId", userId)

        const res = await fetch(url)
        if (!res.ok) throw new Error("Failed to fetch monthly data")

        const json = await res.json()
        setData(json.monthlyData || [])
        setSummary(json.summary || null)
      } catch (err) {
        console.error("Error fetching monthly volume:", err)
        setError(err instanceof Error ? err.message : "Failed to load data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [userId, months])

  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Loading monthly data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-red-200 dark:border-red-500/30", "bg-red-50 dark:bg-red-500/10")}>
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className={cn("text-sm", "text-red-700 dark:text-red-300")}>{error}</p>
        </div>
      </div>
    )
  }

  const isGrowing = (summary?.growthRate || 0) > 0
  const currentMonth = data[data.length - 1]
  const previousMonth = data[data.length - 2]

  return (
    <div className="space-y-6">
      {/* Header with Summary Cards */}
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={cn("font-semibold text-lg", "text-neutral-900 dark:text-slate-200")}>Monthly Report Volume</h3>
            <p className={cn("text-sm mt-1", "text-neutral-600 dark:text-slate-400")}>
              Track your report production over the last {months} months
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("reports")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                viewMode === "reports"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md"
                  : cn("bg-neutral-100 dark:bg-slate-700/50", "text-neutral-700 dark:text-slate-300", "hover:bg-neutral-200 dark:hover:bg-slate-700")
              )}
            >
              Reports
            </button>
            <button
              onClick={() => setViewMode("revenue")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                viewMode === "revenue"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md"
                  : cn("bg-neutral-100 dark:bg-slate-700/50", "text-neutral-700 dark:text-slate-300", "hover:bg-neutral-200 dark:hover:bg-slate-700")
              )}
            >
              Revenue
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-cyan-500/10 to-blue-500/10", "border-cyan-500/20")}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-cyan-500" />
                <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>This Month</p>
              </div>
              <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>
                {currentMonth?.reports || 0}
              </p>
              {previousMonth && (
                <p className={cn("text-xs mt-1", currentMonth?.reports >= previousMonth.reports ? "text-emerald-600" : "text-red-600")}>
                  {currentMonth?.reports >= previousMonth.reports ? "+" : ""}
                  {currentMonth?.reports - previousMonth.reports} vs last month
                </p>
              )}
            </div>

            <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-purple-500/10 to-pink-500/10", "border-purple-500/20")}>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-purple-500" />
                <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Monthly Avg</p>
              </div>
              <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>
                {summary.avgMonthlyReports}
              </p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>reports/month</p>
            </div>

            <div className={cn("p-4 rounded-lg border", isGrowing ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20" : "bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/20")}>
              <div className="flex items-center gap-2 mb-2">
                {isGrowing ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Growth Rate</p>
              </div>
              <p className={cn("text-2xl font-bold", isGrowing ? "text-emerald-600" : "text-red-600")}>
                {isGrowing ? "+" : ""}{summary.growthRate}%
              </p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>vs previous quarter</p>
            </div>

            <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-amber-500/10 to-orange-500/10", "border-amber-500/20")}>
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4 text-amber-500" />
                <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Best Month</p>
              </div>
              <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>
                {summary.bestMonth?.reports || 0}
              </p>
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>
                {summary.bestMonth?.label || "N/A"}
              </p>
            </div>
          </div>
        )}

        {/* Main Chart */}
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="colorVolumeReports" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="colorVolumeRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
            <XAxis
              dataKey="monthLabel"
              className="text-neutral-600 dark:text-slate-400"
              style={{ fontSize: "12px" }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              className="text-neutral-600 dark:text-slate-400"
              style={{ fontSize: "12px" }}
              label={{
                value: viewMode === "reports" ? "Reports" : "Revenue ($)",
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle", fill: "rgb(107 114 128)" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgb(255 255 255 / 0.95)",
                border: "1px solid rgb(229 231 235)",
                borderRadius: "8px",
                color: "#111827",
              }}
              formatter={(value: any, name: string) => {
                if (name === "reports") return [value, "Reports"]
                if (name === "revenue") return [`$${value.toLocaleString()}`, "Revenue"]
                if (name === "completed") return [value, "Completed"]
                if (name === "pending") return [value, "Pending"]
                return [value, name]
              }}
            />
            <Legend />
            {viewMode === "reports" ? (
              <>
                <Bar
                  dataKey="completed"
                  stackId="reports"
                  fill="#10b981"
                  name="Completed"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="pending"
                  stackId="reports"
                  fill="#f59e0b"
                  name="Pending"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="reports"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 4 }}
                  name="Total Reports"
                />
              </>
            ) : (
              <Bar
                dataKey="revenue"
                fill="url(#colorVolumeRevenue)"
                name="Revenue"
                radius={[4, 4, 0, 0]}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* YTD Summary */}
      {summary && (
        <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
          <h4 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Year-to-Date Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>YTD Reports</p>
              <p className={cn("text-xl font-bold", "text-neutral-900 dark:text-slate-200")}>{summary.ytd.reports}</p>
            </div>
            <div>
              <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>YTD Revenue</p>
              <p className={cn("text-xl font-bold text-emerald-600")}>${summary.ytd.revenue.toLocaleString()}</p>
            </div>
            <div>
              <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Total Reports</p>
              <p className={cn("text-xl font-bold", "text-neutral-900 dark:text-slate-200")}>{summary.totalReports}</p>
            </div>
            <div>
              <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Total Revenue</p>
              <p className={cn("text-xl font-bold text-emerald-600")}>${summary.totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
