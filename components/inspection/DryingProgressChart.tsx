"use client"

/**
 * DryingProgressChart
 *
 * Plots moisture readings as a multi-day drying curve per location/material.
 * X-axis: Day 1, Day 2, Day 3 … (relative to first reading per location)
 * Y-axis: Moisture level (%)
 * Reference line: IICRC S500 dry threshold for each material type
 *
 * Each location-material pair becomes its own series.
 * Lines are coloured:
 *   green  — latest reading is at or below dry standard
 *   amber  — latest reading is in drying range (between dry and wet threshold)
 *   red    — latest reading exceeds wet threshold
 *
 * Tooltip shows exact reading, day label, meter type (if available).
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"
import { CheckCircle2, AlertTriangle, TrendingDown, Droplets } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getDryStandard,
  getMoistureStatus,
  STATUS_COLORS,
  IICRC_DRY_STANDARDS,
} from "@/lib/iicrc-dry-standards"

// ── Types ────────────────────────────────────────────────────────

export interface DryingMoistureReading {
  id: string
  location: string
  surfaceType: string // matches material keys in IICRC_DRY_STANDARDS
  moistureLevel: number
  depth: string
  recordedAt: string
  meterType?: string
}

interface DryingProgressChartProps {
  readings: DryingMoistureReading[]
  inspectionStartDate?: string
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────

const SERIES_COLORS = [
  "#06b6d4", // cyan-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
  "#3b82f6", // blue-500
  "#14b8a6", // teal-500
  "#84cc16", // lime-500
]

/** Build a series key from location + surfaceType */
function seriesKey(location: string, surfaceType: string) {
  return `${location} (${surfaceType})`
}

/** Map surfaceType string → IICRC material key */
function toMaterial(surfaceType: string): string {
  const s = surfaceType.toLowerCase()
  if (s.includes("timber") || s.includes("hardwood") || s.includes("wood")) return "timber"
  if (s.includes("softwood") || s.includes("pine")) return "softwood"
  if (s.includes("plasterboard") || s.includes("drywall") || s.includes("gypsum")) return "plasterboard"
  if (s.includes("concrete") || s.includes("masonry") || s.includes("slab")) return "concrete"
  if (s.includes("carpet")) return "carpet"
  if (s.includes("vinyl") || s.includes("lvt") || s.includes("lvp")) return "vinyl"
  if (s.includes("particleboard") || s.includes("mdf") || s.includes("chipboard")) return "particleboard"
  if (s.includes("brick") || s.includes("render")) return "brick"
  if (s.includes("insulation") || s.includes("batts") || s.includes("fibreglass")) return "insulation"
  return "other"
}

/** Day label relative to a start date */
function dayLabel(recordedAt: string, startMs: number): string {
  const day = Math.floor((new Date(recordedAt).getTime() - startMs) / 86_400_000) + 1
  return `Day ${day}`
}

interface SeriesPoint {
  day: string
  dayNum: number
  [key: string]: number | string
}

function buildChartData(readings: DryingMoistureReading[], startMs: number) {
  // Group readings into day buckets per series
  const dayMap: Record<string, SeriesPoint> = {}
  const seriesSet = new Set<string>()

  // Sort chronologically
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  )

  for (const r of sorted) {
    const dayNum = Math.floor((new Date(r.recordedAt).getTime() - startMs) / 86_400_000) + 1
    const day = `Day ${dayNum}`
    const key = seriesKey(r.location, r.surfaceType)

    if (!dayMap[day]) {
      dayMap[day] = { day, dayNum }
    }

    // If multiple readings in same day for same series, take the latest
    const existing = dayMap[day][key] as number | undefined
    if (existing === undefined || r.moistureLevel > 0) {
      dayMap[day][key] = r.moistureLevel
    }

    seriesSet.add(key)
  }

  return {
    data: Object.values(dayMap).sort((a, b) => (a.dayNum as number) - (b.dayNum as number)),
    series: Array.from(seriesSet),
  }
}

/** Latest reading per series */
function getLatestReadings(readings: DryingMoistureReading[]) {
  const latest: Record<string, DryingMoistureReading> = {}
  for (const r of readings) {
    const key = seriesKey(r.location, r.surfaceType)
    if (!latest[key] || new Date(r.recordedAt) > new Date(latest[key].recordedAt)) {
      latest[key] = r
    }
  }
  return latest
}

/** Colour for a series based on latest moisture status */
function seriesColor(
  seriesK: string,
  latestMap: Record<string, DryingMoistureReading>,
  index: number
): string {
  const reading = latestMap[seriesK]
  if (!reading) return SERIES_COLORS[index % SERIES_COLORS.length]
  const material = toMaterial(reading.surfaceType)
  const status = getMoistureStatus(reading.moistureLevel, material)
  if (status === "dry") return "#10b981"   // emerald
  if (status === "drying") return "#f59e0b" // amber
  return "#ef4444"                          // red
}

// ── Custom Tooltip ────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[180px]">
      <p className="font-semibold text-neutral-700 dark:text-slate-200 mb-1">{label}</p>
      {payload.map((entry: any) => {
        // Parse location and surfaceType back from series key
        const match = entry.dataKey.match(/^(.+) \((.+)\)$/)
        const location = match?.[1] ?? entry.dataKey
        const surfaceType = match?.[2] ?? ""
        const material = toMaterial(surfaceType)
        const std = getDryStandard(material)
        const status = getMoistureStatus(entry.value, material)
        const colors = STATUS_COLORS[status]

        return (
          <div key={entry.dataKey} className="flex items-start gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: entry.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-neutral-600 dark:text-slate-400 truncate">{location}</p>
              <div className="flex items-center gap-1.5">
                <span className={cn("font-bold", colors.text)}>{entry.value}%</span>
                <span className="text-neutral-400 dark:text-slate-500">/ target ≤{std.dryThreshold}%</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────

export default function DryingProgressChart({
  readings,
  inspectionStartDate,
  className,
}: DryingProgressChartProps) {
  // ── Empty state ──
  if (!readings || readings.length < 2) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-12 rounded-xl border border-dashed",
          "border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800/20",
          className
        )}
      >
        <Droplets size={32} className="text-neutral-300 dark:text-slate-600" />
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-600 dark:text-slate-400">
            Not enough data yet
          </p>
          <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
            At least 2 moisture readings are required to plot a drying curve
          </p>
        </div>
      </div>
    )
  }

  // ── Determine start date ──
  const startMs = inspectionStartDate
    ? new Date(inspectionStartDate).getTime()
    : Math.min(...readings.map((r) => new Date(r.recordedAt).getTime()))

  const { data, series } = buildChartData(readings, startMs)
  const latestMap = getLatestReadings(readings)

  // Summary stats
  const dryCount = series.filter((s) => {
    const r = latestMap[s]
    if (!r) return false
    return getMoistureStatus(r.moistureLevel, toMaterial(r.surfaceType)) === "dry"
  }).length
  const dryingCount = series.filter((s) => {
    const r = latestMap[s]
    if (!r) return false
    return getMoistureStatus(r.moistureLevel, toMaterial(r.surfaceType)) === "drying"
  }).length
  const wetCount = series.length - dryCount - dryingCount

  // Find the most common material for the primary reference line
  const materialCounts: Record<string, number> = {}
  for (const r of readings) {
    const m = toMaterial(r.surfaceType)
    materialCounts[m] = (materialCounts[m] || 0) + 1
  }
  const primaryMaterial = Object.entries(materialCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other"
  const primaryStd = getDryStandard(primaryMaterial)

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status summary */}
      <div className="flex flex-wrap gap-2">
        {dryCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
            <CheckCircle2 size={12} />
            {dryCount} location{dryCount > 1 ? "s" : ""} dry
          </span>
        )}
        {dryingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
            <TrendingDown size={12} />
            {dryingCount} drying
          </span>
        )}
        {wetCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
            <AlertTriangle size={12} />
            {wetCount} still wet
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800/30 p-4">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Drying Progress Curve
            </h4>
            <p className="text-xs text-neutral-500 dark:text-slate-500 mt-0.5">
              IICRC S500:2021 — moisture % per location over drying period
            </p>
          </div>
          <div className="text-right text-xs text-neutral-400 dark:text-slate-500 flex-shrink-0">
            <p className="font-medium">{primaryStd.label}</p>
            <p>Target ≤{primaryStd.dryThreshold}%</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-neutral-400 dark:text-slate-500"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-neutral-400 dark:text-slate-500"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />

            {/* Primary material dry threshold reference line */}
            <ReferenceLine
              y={primaryStd.dryThreshold}
              stroke="#10b981"
              strokeDasharray="6 3"
              label={{
                value: `Dry target ≤${primaryStd.dryThreshold}%`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#10b981",
              }}
            />

            {/* One line per location-material series */}
            {series.map((s, i) => {
              const color = seriesColor(s, latestMap, i)
              return (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={s}
                  stroke={color}
                  strokeWidth={2.5}
                  dot={{ r: 4.5, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                  connectNulls
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Per-location status table */}
      {series.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-50 dark:bg-slate-800/50 border-b border-neutral-200 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
              Location Summary — Latest Readings
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-slate-500">Location</th>
                <th className="px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-slate-500">Material</th>
                <th className="px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-slate-500 text-right">Reading</th>
                <th className="px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-slate-500 text-right">Target</th>
                <th className="px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-slate-500 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-700">
              {series.map((s) => {
                const r = latestMap[s]
                if (!r) return null
                const material = toMaterial(r.surfaceType)
                const std = getDryStandard(material)
                const status = getMoistureStatus(r.moistureLevel, material)
                const colors = STATUS_COLORS[status]

                return (
                  <tr key={s} className="bg-white dark:bg-slate-800/20 hover:bg-neutral-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-white">
                      {r.location}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 dark:text-slate-400">
                      {std.label}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", colors.text)}>
                      {r.moistureLevel}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-neutral-400 dark:text-slate-500 tabular-nums">
                      ≤{std.dryThreshold}%
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full", colors.bg, colors.text, colors.border, "border")}>
                        {status === "dry" && <CheckCircle2 size={10} />}
                        {status === "drying" && <TrendingDown size={10} />}
                        {status === "wet" && <AlertTriangle size={10} />}
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
