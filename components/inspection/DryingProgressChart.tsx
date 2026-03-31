"use client"

import React from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

const IICRC_TARGETS: Record<string, number> = {
  timber: 19,
  softwood: 19,
  plasterboard: 1.5,
  concrete: 3.5,
  carpet: 3,
  vinyl: 3.5,
  particleboard: 10,
  brick: 4,
  insulation: 2,
  other: 15,
}

const MATERIAL_COLOURS: Record<string, string> = {
  timber: "#8B5CF6",
  plasterboard: "#3B82F6",
  concrete: "#6B7280",
  carpet: "#F59E0B",
  vinyl: "#10B981",
  other: "#EF4444",
  softwood: "#A78BFA",
  particleboard: "#F97316",
  brick: "#92400E",
  insulation: "#06B6D4",
}

function getMaterialColour(material: string): string {
  return MATERIAL_COLOURS[material.toLowerCase()] ?? "#94A3B8"
}

function getIicrcTarget(material: string): number {
  return IICRC_TARGETS[material.toLowerCase()] ?? IICRC_TARGETS.other
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}`
}

interface MoistureReading {
  id: string
  surfaceType: string
  moistureLevel: number
  recordedAt: string
}

interface ChartDataPoint {
  day: string
  isoDate: string
  [material: string]: string | number
}

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipPayloadEntry[]
}

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-neutral-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((entry) => {
        const target = getIicrcTarget(entry.name)
        const isAbove = entry.value > target
        return (
          <div key={entry.name} className="flex items-center gap-2 mb-1">
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-neutral-600 dark:text-slate-400 capitalize">{entry.name}:</span>
            <span className="font-medium" style={{ color: entry.color }}>
              {entry.value.toFixed(1)}%
            </span>
            <span
              className={
                isAbove
                  ? "text-red-500 dark:text-red-400 text-xs font-medium"
                  : "text-emerald-500 dark:text-emerald-400 text-xs font-medium"
              }
            >
              {isAbove ? `▲ above target (${target}%)` : `✓ at target (${target}%)`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export interface DryingProgressChartProps {
  inspectionId: string
}

export default function DryingProgressChart({ inspectionId }: DryingProgressChartProps) {
  const [readings, setReadings] = React.useState<MoistureReading[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await fetch(`/api/inspections/${inspectionId}`)
        if (!res.ok) throw new Error("Failed to fetch inspection data")
        const data = await res.json()
        const raw: MoistureReading[] = (data.inspection?.moistureReadings ?? []).map(
          (r: { id: string; surfaceType: string; moistureLevel: number; recordedAt: string; createdAt: string }) => ({
            id: r.id,
            surfaceType: r.surfaceType,
            moistureLevel: r.moistureLevel,
            recordedAt: r.recordedAt ?? r.createdAt,
          })
        )
        setReadings(raw)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [inspectionId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-400 dark:text-slate-500 text-sm">
        Loading moisture data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 dark:text-red-500 text-sm">
        {error}
      </div>
    )
  }

  if (readings.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 p-8 text-center">
        <p className="text-neutral-400 dark:text-slate-500 text-sm">No moisture readings recorded yet</p>
      </div>
    )
  }

  // Derive unique materials
  const materials = Array.from(new Set(readings.map((r) => r.surfaceType.toLowerCase())))

  // Group by day: for each (day, material) take the average moisture level
  const dayMaterialMap = new Map<string, Map<string, number[]>>()

  for (const r of readings) {
    const dayKey = new Date(r.recordedAt).toISOString().slice(0, 10) // YYYY-MM-DD
    if (!dayMaterialMap.has(dayKey)) dayMaterialMap.set(dayKey, new Map())
    const matMap = dayMaterialMap.get(dayKey)!
    const mat = r.surfaceType.toLowerCase()
    if (!matMap.has(mat)) matMap.set(mat, [])
    matMap.get(mat)!.push(r.moistureLevel)
  }

  const sortedDays = Array.from(dayMaterialMap.keys()).sort()

  const chartData: ChartDataPoint[] = sortedDays.map((day) => {
    const point: ChartDataPoint = { day: formatDay(day), isoDate: day }
    const matMap = dayMaterialMap.get(day)!
    for (const mat of materials) {
      const values = matMap.get(mat)
      if (values && values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length
        point[mat] = Math.round(avg * 10) / 10
      }
    }
    return point
  })

  // Reference lines: one per material at IICRC target
  const referenceLines = materials.map((mat) => ({
    material: mat,
    target: getIicrcTarget(mat),
    colour: getMaterialColour(mat),
  }))

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 p-4">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-100 dark:text-slate-800" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-neutral-400 dark:text-slate-500"
          />
          <YAxis
            domain={[0, 30]}
            tickCount={7}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            label={{ value: "MC%", angle: -90, position: "insideLeft", offset: 12, fontSize: 11 }}
            stroke="currentColor"
            className="text-neutral-400 dark:text-slate-500"
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value: string) => (
              <span className="capitalize text-neutral-600 dark:text-slate-300">{value}</span>
            )}
          />

          {/* Reference lines at IICRC targets */}
          {referenceLines.map(({ material, target, colour }) => (
            <ReferenceLine
              key={`ref-${material}`}
              y={target}
              stroke={colour}
              strokeDasharray="5 3"
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
          ))}

          {/* One line per material */}
          {materials.map((mat) => (
            <Line
              key={mat}
              type="monotone"
              dataKey={mat}
              name={mat}
              stroke={getMaterialColour(mat)}
              strokeWidth={2}
              dot={{ r: 4, fill: getMaterialColour(mat), strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-neutral-400 dark:text-slate-500 mt-2 text-center">
        Dashed lines indicate IICRC S500:2025 §11.4 drying targets per material
      </p>
    </div>
  )
}

