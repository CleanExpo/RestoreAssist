"use client"

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts"
import { Loader2 } from "lucide-react"
import { useState } from "react"

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
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Loading chart...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="font-semibold mb-4">Reports by Damage Type</h3>
        <div className="flex items-center justify-center h-[300px] text-slate-400">
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
    <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
      <h3 className="font-semibold text-lg mb-4">Reports by Damage Type</h3>

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
              backgroundColor: "#1e293b",
              border: "1px solid #475569",
              borderRadius: "8px",
            }}
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
            className="flex items-center justify-between p-2 rounded hover:bg-slate-700/20 transition-colors"
            onMouseEnter={() => setHoveredSegment(item.name)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-slate-300">{item.name}</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium">{item.value}</span>
              <span className="text-xs text-slate-400 ml-2">
                ({((item.value / total) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
