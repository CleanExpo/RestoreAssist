"use client"

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface DamageType {
  name: string
  value: number
  color?: string
}

interface DamageTypesChartProps {
  data: DamageType[]
  loading?: boolean
}

const defaultColors: Record<string, string> = {
  Water: "#3b82f6",
  Fire: "#f97316",
  Storm: "#8b5cf6",
  Mould: "#10b981",
  Other: "#6b7280",
}

export default function DamageTypesChart({
  data,
  loading = false,
}: DamageTypesChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)

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
        <h3 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Reports by Damage Type</h3>
        <div className={cn("flex items-center justify-center h-[300px]", "text-neutral-600 dark:text-slate-400")}>
          No data available
        </div>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)
  const chartData = data.map((d) => ({
    ...d,
    color: d.color || defaultColors[d.name] || "#6b7280",
  }))

  return (
    <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
      <h3 className={cn("font-semibold text-lg mb-4", "text-neutral-900 dark:text-slate-200")}>Reports by Damage Type</h3>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            onMouseEnter={(_, index) => setHoveredSegment(chartData[index]?.name || null)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                opacity={
                  hoveredSegment === null || hoveredSegment === entry.name ? 1 : 0.5
                }
                style={{ transition: "opacity 0.2s" }}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(255 255 255 / 0.95)",
              border: "1px solid rgb(229 231 235)",
              borderRadius: "8px",
              color: "#111827",
            }}
            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            formatter={(value: any) => [
              `${value} reports`,
              "Count",
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend with percentages */}
      <div className="mt-6 space-y-2">
        {chartData.map((item) => (
          <div
            key={item.name}
            className={cn("flex items-center justify-between p-2 rounded transition-colors", "hover:bg-neutral-100 dark:hover:bg-slate-700/20")}
            onMouseEnter={() => setHoveredSegment(item.name)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className={cn("text-sm", "text-neutral-700 dark:text-slate-300")}>{item.name}</span>
            </div>
            <div className="text-right">
              <span className={cn("text-sm font-medium", "text-neutral-900 dark:text-slate-200")}>{item.value}</span>
              <span className={cn("text-xs ml-2", "text-neutral-600 dark:text-slate-400")}>
                ({((item.value / total) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
