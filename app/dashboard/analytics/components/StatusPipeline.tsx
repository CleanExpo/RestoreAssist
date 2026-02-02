"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Loader2, GitBranch } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusItem {
  status: string
  count: number
  revenue: number
}

interface StatusPipelineProps {
  data: StatusItem[]
  loading?: boolean
}

const statusColors: Record<string, string> = {
  DRAFT: "#94a3b8",
  PENDING: "#f59e0b",
  APPROVED: "#3b82f6",
  COMPLETED: "#10b981",
  ARCHIVED: "#6b7280",
}

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
}

export default function StatusPipeline({ data, loading = false }: StatusPipelineProps) {
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
          <GitBranch className="w-5 h-5 text-violet-500" />
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            Report Pipeline
          </h3>
        </div>
        <div className={cn("flex items-center justify-center h-[200px]", "text-neutral-600 dark:text-slate-400")}>
          No status data for this period
        </div>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    name: statusLabels[d.status] || d.status,
    count: d.count,
    revenue: d.revenue,
    fill: statusColors[d.status] || "#6b7280",
  }))

  return (
    <div className={cn("p-6 rounded-2xl border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30", "hover:border-violet-500/30")}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-violet-500" />
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
            Report Pipeline
          </h3>
        </div>
        <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
          By status
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-slate-700" horizontal={false} />
          <XAxis type="number" className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
          <YAxis type="category" dataKey="name" width={72} className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(255 255 255 / 0.95)",
              border: "1px solid rgb(229 231 235)",
              borderRadius: "8px",
              color: "#111827",
            }}
            formatter={(value: number, _name: string, props: { payload?: { count?: number; revenue?: number } }) => [
              `${value} reports · $${(props?.payload?.revenue ?? 0).toLocaleString()}`,
              "Count · Revenue",
            ]}
            labelFormatter={(label) => `Status: ${label}`}
          />
          <Bar dataKey="count" name="count" radius={[0, 4, 4, 0]} minPointSize={8}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={cn("mt-4 pt-4 border-t flex flex-wrap gap-3", "border-neutral-200 dark:border-slate-700/50")}>
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
              {d.name}: {d.count} · ${(d.revenue / 1000).toFixed(1)}K
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
