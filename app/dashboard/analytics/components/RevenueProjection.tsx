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
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Calculating projections...</p>
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
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="font-semibold mb-4">30/60/90 Day Revenue Forecast</h3>
        <div className="flex items-center justify-center h-[300px] text-slate-400">
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
    <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">30/60/90 Day Revenue Forecast</h3>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-700/20 border border-slate-600">
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
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            style={{ fontSize: "12px" }}
            angle={combinedData.length > 15 ? -45 : 0}
            textAnchor={combinedData.length > 15 ? "end" : "middle"}
            height={combinedData.length > 15 ? 80 : 30}
          />
          <YAxis stroke="#94a3b8" style={{ fontSize: "12px" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #475569",
              borderRadius: "8px",
            }}
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
      <div className="mt-6 grid grid-cols-3 gap-4 p-4 bg-slate-700/10 rounded-lg border border-slate-600/20">
        <div>
          <p className="text-xs text-slate-400 mb-1">30-Day Projection</p>
          <p className="text-lg font-semibold text-cyan-400">
            ${(projected.slice(0, 30).reduce((sum, p) => sum + p.revenue, 0) || 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">60-Day Projection</p>
          <p className="text-lg font-semibold text-cyan-400">
            ${(projected.slice(0, 60).reduce((sum, p) => sum + p.revenue, 0) || 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">90-Day Projection</p>
          <p className="text-lg font-semibold text-cyan-400">
            ${(projected.slice(0, 90).reduce((sum, p) => sum + p.revenue, 0) || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Projections are based on linear regression analysis of historical data.
        Confidence decreases as predictions extend further into the future.
      </p>
    </div>
  )
}
