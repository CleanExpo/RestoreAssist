"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts"
import { Loader2, FileText, CheckCircle2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface MonthlyVolumeData {
  month: string
  monthKey: string
  total: number
  completed: number
  inProgress: number
}

interface MonthlyVolumeChartProps {
  data: MonthlyVolumeData[]
  summary?: {
    totalReports: number
    totalCompleted: number
    completionRate: number
    averagePerMonth: number
  }
  loading?: boolean
}

export default function MonthlyVolumeChart({
  data,
  summary,
  loading = false,
}: MonthlyVolumeChartProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Loading monthly volume...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Monthly Report Volume</h3>
        <div className={cn("flex items-center justify-center h-[300px]", "text-neutral-600 dark:text-slate-400")}>
          No data available for selected period
        </div>
      </div>
    )
  }

  return (
    <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={cn("font-semibold text-lg", "text-neutral-900 dark:text-slate-200")}>Monthly Report Volume</h3>
        {summary && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className={cn("text-neutral-600 dark:text-slate-400")}>{summary.totalReports} total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className={cn("text-neutral-600 dark:text-slate-400")}>{summary.completionRate}% completed</span>
            </div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
          <XAxis
            dataKey="month"
            className="text-neutral-600 dark:text-slate-400"
            style={{ fontSize: "12px" }}
            angle={data.length > 6 ? -45 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 80 : 30}
          />
          <YAxis
            className="text-neutral-600 dark:text-slate-400"
            style={{ fontSize: "12px" }}
            label={{ value: "Reports", angle: -90, position: "insideLeft", style: { textAnchor: 'middle', fill: 'rgb(75 85 99)' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(255 255 255 / 0.95)",
              border: "1px solid rgb(229 231 235)",
              borderRadius: "8px",
              color: "#111827",
            }}
            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            formatter={(value: any, name: string) => {
              if (name === "Total") return [value, "Total Reports"]
              if (name === "Completed") return [value, "Completed"]
              if (name === "In Progress") return [value, "In Progress"]
              return [value, name]
            }}
          />
          <Legend />
          <Bar
            dataKey="total"
            fill="url(#colorTotal)"
            name="Total"
            radius={[8, 8, 0, 0]}
          />
          <Bar
            dataKey="completed"
            fill="url(#colorCompleted)"
            name="Completed"
            radius={[8, 8, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="completed"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: "#10b981", r: 4 }}
            name="Completion Trend"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      {summary && (
        <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t", "border-neutral-200 dark:border-slate-700")}>
          <div>
            <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Total Reports</p>
            <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
              {summary.totalReports}
            </p>
          </div>
          <div>
            <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Completed</p>
            <p className={cn("text-lg font-semibold text-emerald-600 dark:text-emerald-400")}>
              {summary.totalCompleted}
            </p>
          </div>
          <div>
            <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Completion Rate</p>
            <p className={cn("text-lg font-semibold text-blue-600 dark:text-blue-400")}>
              {summary.completionRate}%
            </p>
          </div>
          <div>
            <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Avg per Month</p>
            <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
              {summary.averagePerMonth}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
