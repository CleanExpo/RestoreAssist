"use client"

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface RevenueChartData {
  date: string
  revenue: number
  reports?: number
}

interface RevenueChartProps {
  data: RevenueChartData[]
  loading?: boolean
  dateRange?: string
}

export default function RevenueChart({
  data,
  loading = false,
  dateRange = "30days",
}: RevenueChartProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Loading chart...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Revenue Trend</h3>
        <div className={cn("flex items-center justify-center h-[300px]", "text-neutral-600 dark:text-slate-400")}>
          No data available for selected period
        </div>
      </div>
    )
  }

  return (
    <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={cn("font-semibold text-lg", "text-neutral-900 dark:text-slate-200")}>Revenue Trend</h3>
        <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>{dateRange}</span>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
          <XAxis
            dataKey="date"
            className="text-neutral-600 dark:text-slate-400"
            style={{ fontSize: "12px" }}
            angle={data.length > 10 ? -45 : 0}
            textAnchor={data.length > 10 ? "end" : "middle"}
            height={data.length > 10 ? 80 : 30}
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
            formatter={(value: any) => [
              typeof value === "number" ? `$${value.toLocaleString()}` : value,
              "Revenue",
            ]}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#10b981"
            fillOpacity={1}
            fill="url(#colorRevenue)"
            name="Revenue"
          />
          {data[0]?.reports !== undefined && (
            <Bar
              dataKey="reports"
              fill="#3b82f6"
              name="Reports"
              opacity={0.6}
              yAxisId="right"
            />
          )}
          {data[0]?.reports !== undefined && (
            <YAxis yAxisId="right" className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Stats below chart */}
      <div className={cn("grid grid-cols-3 gap-4 mt-6 pt-6 border-t", "border-neutral-200 dark:border-slate-700")}>
        <div>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Total Revenue</p>
          <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            ${data.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Average Daily</p>
          <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            ${Math.round(data.reduce((sum, d) => sum + d.revenue, 0) / data.length).toLocaleString()}
          </p>
        </div>
        <div>
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Highest Day</p>
          <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            ${Math.max(...data.map((d) => d.revenue)).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
