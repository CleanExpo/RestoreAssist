"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Droplets,
  Calendar,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// ── Types (mirrors API response) ─────────────────────────────────────────────

type DryingStatus = "PROGRESSING" | "PLATEAU" | "ACHIEVED" | "NO_DATA"

interface ReadingSnapshot {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  target: number
  aboveTarget: boolean
  notes: string | null
  recordedAt: string
}

interface DailyLog {
  date: string
  readings: ReadingSnapshot[]
  readingCount: number
  avgMoisture: number
  maxMoisture: number
  aboveTargetCount: number
  dryingStatus: DryingStatus
  statusReason: string
  technicianNotes?: string
}

interface MonitoringReport {
  inspectionId: string
  inspectionNumber: string
  propertyAddress: string
  technicianName: string | null
  inspectionDate: string
  iicrcReference: string
  affectedAreas: Array<{
    roomZoneId: string
    category: string | null
    class: string | null
    affectedSquareFootage: number
  }>
  totalDaysMonitored: number
  currentAvgMoisture: number | null
  overallDryingStatus: DryingStatus
  dailyLogs: DailyLog[]
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusBadgeVariant(status: DryingStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACHIEVED":    return "default"
    case "PROGRESSING": return "secondary"
    case "PLATEAU":     return "destructive"
    default:            return "outline"
  }
}

function statusLabel(status: DryingStatus): string {
  switch (status) {
    case "ACHIEVED":    return "Drying Achieved"
    case "PROGRESSING": return "Progressing"
    case "PLATEAU":     return "Plateau"
    default:            return "No Data"
  }
}

function StatusIcon({ status }: { status: DryingStatus }) {
  switch (status) {
    case "ACHIEVED":    return <CheckCircle2 size={14} className="text-emerald-600" />
    case "PROGRESSING": return <TrendingDown size={14} className="text-cyan-600" />
    case "PLATEAU":     return <Minus size={14} className="text-amber-600" />
    default:            return <TrendingUp size={14} className="text-neutral-400" />
  }
}

function moistureColor(level: number, target: number): string {
  if (level <= target)                   return "text-emerald-600 dark:text-emerald-400"
  if (level <= target * 1.5)             return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// ── Page component ────────────────────────────────────────────────────────────

export default function MonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [report, setReport] = useState<MonitoringReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/inspections/${id}/monitoring-report`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError((data as { error?: string }).error ?? "Failed to load monitoring report")
          return
        }
        const data = await res.json() as { report: MonitoringReport }
        setReport(data.report)
      } catch {
        setError("Network error — could not load report")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-cyan-500" size={28} />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="space-y-4 p-6">
        <button
          onClick={() => router.push(`/dashboard/inspections/${id}`)}
          className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Inspection
        </button>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-400">
          {error ?? "Report unavailable"}
        </div>
      </div>
    )
  }

  const hasReadings = report.dailyLogs.length > 0

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push(`/dashboard/inspections/${id}`)}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
              Daily Drying Monitoring Report
            </h1>
            <Badge variant="outline" className="text-xs font-mono border-cyan-300 text-cyan-700 dark:text-cyan-400">
              {report.iicrcReference}
            </Badge>
          </div>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            {report.inspectionNumber} · {report.propertyAddress}
          </p>
          {report.technicianName && (
            <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
              Technician: {report.technicianName}
            </p>
          )}
        </div>
        {/* Export link — PDF rendering is future work; links to the report page */}
        <a
          href={`/api/inspections/${id}/report?format=pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-neutral-50 dark:hover:bg-slate-700 text-neutral-700 dark:text-slate-200 transition-colors"
        >
          <FileText size={12} /> Export PDF
        </a>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-slate-400 flex items-center gap-2">
              <Calendar size={14} /> Days Monitored
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-neutral-900 dark:text-white">
              {report.totalDaysMonitored}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-slate-400 flex items-center gap-2">
              <Droplets size={14} /> Current Avg Moisture
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-neutral-900 dark:text-white">
              {report.currentAvgMoisture !== null ? `${report.currentAvgMoisture}%` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-slate-400 flex items-center gap-2">
              <StatusIcon status={report.overallDryingStatus} /> Drying Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={statusBadgeVariant(report.overallDryingStatus)}
              className="text-sm px-3 py-1"
            >
              {statusLabel(report.overallDryingStatus)}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* ── Empty state ── */}
      {!hasReadings && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Droplets size={40} className="text-neutral-300 dark:text-slate-600" />
            <p className="text-neutral-500 dark:text-slate-400 font-medium">No moisture readings yet</p>
            <p className="text-sm text-neutral-400 dark:text-slate-500 text-center max-w-xs">
              Add moisture readings to this inspection to generate the daily drying log.
            </p>
            <button
              onClick={() => router.push(`/dashboard/inspections/${id}`)}
              className="mt-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
            >
              Add Readings
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── Daily log timeline ── */}
      {hasReadings && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Daily Log Timeline</h2>
          {[...report.dailyLogs].reverse().map((log, revIdx) => {
            const dayNumber = report.dailyLogs.length - revIdx
            return (
              <Card key={log.date} className="overflow-hidden">
                {/* Day header */}
                <CardHeader className="pb-3 border-b border-neutral-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono bg-neutral-100 dark:bg-slate-800 text-neutral-500 dark:text-slate-400 px-2 py-0.5 rounded">
                        Day {dayNumber}
                      </span>
                      <span className="font-semibold text-neutral-900 dark:text-white text-sm">
                        {formatDate(log.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={statusBadgeVariant(log.dryingStatus)} className="text-xs">
                        {statusLabel(log.dryingStatus)}
                      </Badge>
                      {log.aboveTargetCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle size={11} />
                          {log.aboveTargetCount} above target
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Status reason */}
                  <p className="text-xs text-neutral-400 dark:text-slate-500 mt-1">{log.statusReason}</p>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* Quick stats row */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xs text-neutral-400 dark:text-slate-500 mb-1">Avg MC%</p>
                      <p className="text-lg font-bold text-neutral-900 dark:text-white">{log.avgMoisture}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 dark:text-slate-500 mb-1">Max MC%</p>
                      <p className="text-lg font-bold text-neutral-900 dark:text-white">{log.maxMoisture}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 dark:text-slate-500 mb-1">Readings</p>
                      <p className="text-lg font-bold text-neutral-900 dark:text-white">{log.readingCount}</p>
                    </div>
                  </div>

                  {/* Readings table */}
                  <div className="overflow-x-auto rounded-lg border border-neutral-100 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-50 dark:bg-slate-800/50">
                          <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 dark:text-slate-400">Location</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 dark:text-slate-400">Material</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500 dark:text-slate-400">MC%</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500 dark:text-slate-400">Target</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500 dark:text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                        {log.readings.map((r) => (
                          <tr key={r.id} className={r.aboveTarget ? "bg-amber-50/40 dark:bg-amber-900/5" : ""}>
                            <td className="px-3 py-2 text-neutral-900 dark:text-white font-medium">
                              {r.location}
                              {r.depth !== "Surface" && (
                                <span className="ml-1 text-xs text-neutral-400">({r.depth})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-neutral-600 dark:text-slate-300 capitalize">{r.surfaceType}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${moistureColor(r.moistureLevel, r.target)}`}>
                              {r.moistureLevel}%
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-neutral-400 dark:text-slate-500">
                              {r.target}%
                            </td>
                            <td className="px-3 py-2">
                              {r.aboveTarget ? (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                                  <AlertTriangle size={11} /> Above target
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                                  <CheckCircle2 size={11} /> At target
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Technician notes */}
                  {log.technicianNotes && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 px-3 py-2 text-sm text-blue-800 dark:text-blue-300">
                      <span className="font-medium">Notes: </span>{log.technicianNotes}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
