"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Loader2, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

interface DayItem {
  day: string
  dayNumber: number
  reports: number
  revenue: number
}

interface ActivityByDayProps {
  data: DayItem[]
  loading?: boolean
}

const dayColors = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#3b82f6"]

export default function ActivityByDay({ data, loading = false }: ActivityByDayProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[280px] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-5 h-5 text-cyan-500" />
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            Activity by Day of Week
          </h3>
        </div>
        <div className={cn("flex items-center justify-center h-[200px]", "text-neutral-600 dark:text-slate-400")}>
          No activity data for this period
        </div>
      </div>
    )
  }

  return (
    <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30", "hover:border-cyan-500/30")}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-cyan-500" />
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            Activity by Day of Week
          </h3>
        </div>
        <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
          Reports created
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-slate-700" />
          <XAxis
            dataKey="day"
            className="text-neutral-600 dark:text-slate-400"
            style={{ fontSize: "12px" }}
            tickLine={false}
          />
          <YAxis className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(255 255 255 / 0.95)",
              border: "1px solid rgb(229 231 235)",
              borderRadius: "8px",
              color: "#111827",
            }}
            formatter={(value: number, _name: string, props: { payload?: DayItem }) => [
              `${value} reports · $${(props?.payload?.revenue ?? 0).toLocaleString()}`,
              "Reports · Revenue",
            ]}
            labelFormatter={(label) => `Day: ${label}`}
          />
          <Bar dataKey="reports" name="reports" radius={[6, 6, 0, 0]} minPointSize={4}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={dayColors[index % dayColors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={cn("mt-4 pt-4 border-t grid grid-cols-2 gap-2", "border-neutral-200 dark:border-slate-700/50")}>
        <div>
          <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Total reports (week)</p>
          <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            {data.reduce((s, d) => s + d.reports, 0)}
          </p>
        </div>
        <div>
          <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Total revenue (week pattern)</p>
          <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            ${data.reduce((s, d) => s + d.revenue, 0).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}
