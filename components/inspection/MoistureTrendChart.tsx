"use client"

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
import { AlertTriangle, TrendingDown, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMoistureStatus, STATUS_COLORS, getDryStandard } from "@/lib/iicrc-dry-standards"

/** Default reference line — timber/generic dry threshold */
const DRY_STANDARD = 19 // IICRC S500 timber dry threshold (most common material)

interface MoistureReading {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  recordedAt: string
}

interface MoistureTrendChartProps {
  readings: MoistureReading[]
  className?: string
}

type SeriesData = Record<string, { time: number; label: string; [location: string]: number | string }>

const COLORS = [
  "#06b6d4", // cyan-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#10b981", // emerald-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
  "#3b82f6", // blue-500
  "#14b8a6", // teal-500
]

function formatTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function buildChartData(readings: MoistureReading[]) {
  // Group by timestamp bucket (per recordedAt), series = location
  const byTime: SeriesData = {}
  const locations = new Set<string>()

  const sorted = [...readings].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  )

  for (const r of sorted) {
    const time = new Date(r.recordedAt).getTime()
    const label = formatTime(r.recordedAt)
    if (!byTime[time]) byTime[time] = { time, label }
    byTime[time][r.location] = r.moistureLevel
    locations.add(r.location)
  }

  return {
    data: Object.values(byTime).sort((a, b) => (a.time as number) - (b.time as number)),
    locations: Array.from(locations),
  }
}

function getAlerts(readings: MoistureReading[]) {
  // Latest reading per location — check which are above dry standard
  const latest: Record<string, MoistureReading> = {}
  for (const r of readings) {
    if (!latest[r.location] || new Date(r.recordedAt) > new Date(latest[r.location].recordedAt)) {
      latest[r.location] = r
    }
  }
  return Object.values(latest).filter(r => r.moistureLevel > DRY_STANDARD)
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 dark:text-slate-400">{entry.dataKey}:</span>
          <span className={cn(
            "font-semibold",
            entry.value <= DRY_STANDARD
              ? "text-emerald-600 dark:text-emerald-400"
              : entry.value <= 25
              ? "text-amber-600 dark:text-amber-400"
              : "text-rose-600 dark:text-rose-400"
          )}>
            {entry.value}%
          </span>
          {entry.value <= DRY_STANDARD && <CheckCircle2 size={11} className="text-emerald-500" />}
          {entry.value > DRY_STANDARD && <AlertTriangle size={11} className="text-amber-500" />}
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 flex items-center gap-1 text-gray-400 dark:text-slate-500">
        <span>Dry standard: ≤{DRY_STANDARD}%</span>
      </div>
    </div>
  )
}

export default function MoistureTrendChart({ readings, className }: MoistureTrendChartProps) {
  if (!readings || readings.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-48 rounded-xl border border-dashed border-gray-200 dark:border-slate-700", className)}>
        <p className="text-sm text-gray-500 dark:text-slate-500">No moisture readings recorded yet.</p>
      </div>
    )
  }

  const { data, locations } = buildChartData(readings)
  const alerts = getAlerts(readings)

  // Aggregate summary
  const latestByLocation: Record<string, number> = {}
  for (const r of readings) {
    const existing = latestByLocation[r.location]
    if (existing === undefined || new Date(r.recordedAt) > new Date(readings.find(x => x.location === r.location && x.moistureLevel === existing)?.recordedAt ?? "")) {
      latestByLocation[r.location] = r.moistureLevel
    }
  }
  const dryCount = Object.values(latestByLocation).filter(v => v <= DRY_STANDARD).length
  const totalLocations = Object.keys(latestByLocation).length

  return (
    <div className={cn("space-y-4", className)}>
      {/* Alert banner */}
      {alerts.length > 0 ? (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {alerts.length} location{alerts.length > 1 ? "s" : ""} above dry standard
            </p>
            <p className="text-amber-600 dark:text-amber-500 text-xs mt-0.5">
              {alerts.map(a => a.location).join(", ")} — readings above {DRY_STANDARD}%
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-sm">
          <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
            All {dryCount}/{totalLocations} locations at or below dry standard ({DRY_STANDARD}%)
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Moisture Trend</h4>
            <p className="text-xs text-gray-500 dark:text-slate-500">Readings over time · Dry standard ≤{DRY_STANDARD}%</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
            <TrendingDown size={14} />
            <span>Goal: below {DRY_STANDARD}%</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-gray-500 dark:text-slate-500"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-gray-500 dark:text-slate-500"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            {/* Dry standard reference line */}
            <ReferenceLine
              y={DRY_STANDARD}
              stroke="#10b981"
              strokeDasharray="5 3"
              label={{
                value: `Dry ≤${DRY_STANDARD}%`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#10b981",
              }}
            />
            {locations.map((loc, i) => (
              <Line
                key={loc}
                type="monotone"
                dataKey={loc}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, fill: COLORS[i % COLORS.length], strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Location summary table */}
      {totalLocations > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wide text-right">Latest Reading</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wide text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {Object.entries(latestByLocation).map(([loc, level]) => (
                <tr key={loc} className="bg-white dark:bg-slate-800/20">
                  <td className="px-4 py-2.5 text-gray-900 dark:text-white font-medium">{loc}</td>
                  <td className={cn(
                    "px-4 py-2.5 text-right font-semibold",
                    level <= DRY_STANDARD ? "text-emerald-600 dark:text-emerald-400" :
                    level <= 25 ? "text-amber-600 dark:text-amber-400" :
                    "text-rose-600 dark:text-rose-400"
                  )}>
                    {level}%
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {level <= DRY_STANDARD ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={11} /> Dry
                      </span>
                    ) : level <= 25 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={11} /> Caution
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={11} /> Wet
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
