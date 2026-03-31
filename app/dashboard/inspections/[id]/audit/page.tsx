"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface AuditLog {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  userId: string
  device: string | null
  gpsLocation: string | null
  changes: string | null
  previousValue: string | null
  newValue: string | null
  timestamp: string
  ipAddress: string | null
  userAgent: string | null
}

type ActionFilter = "all" | "create" | "update" | "delete" | "view"

const ACTION_TABS: { key: ActionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
  { key: "view", label: "View" },
]

function getActionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  const lower = action.toLowerCase()
  if (lower.includes("creat") || lower.includes("add") || lower.includes("submit")) return "default"
  if (lower.includes("delet") || lower.includes("remov")) return "destructive"
  if (lower.includes("view") || lower.includes("read") || lower.includes("fetch")) return "outline"
  return "secondary"
}

function getActionColor(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes("creat") || lower.includes("add") || lower.includes("submit")) {
    return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
  }
  if (lower.includes("delet") || lower.includes("remov")) {
    return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
  }
  if (lower.includes("view") || lower.includes("read") || lower.includes("fetch")) {
    return "bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300 border-neutral-200 dark:border-slate-700"
  }
  return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
}

function getTimelineDotColor(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes("creat") || lower.includes("add") || lower.includes("submit")) {
    return "bg-emerald-500"
  }
  if (lower.includes("delet") || lower.includes("remov")) {
    return "bg-red-500"
  }
  if (lower.includes("view") || lower.includes("read") || lower.includes("fetch")) {
    return "bg-neutral-400 dark:bg-slate-500"
  }
  return "bg-blue-500"
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function DiffView({ previous, next }: { previous: string | null; next: string | null }) {
  if (!previous && !next) return null

  let prevDisplay: string = previous ?? "—"
  let nextDisplay: string = next ?? "—"

  // Try to pretty-print JSON
  try {
    if (previous) prevDisplay = JSON.stringify(JSON.parse(previous), null, 2)
  } catch {
    /* not JSON, use as-is */
  }
  try {
    if (next) nextDisplay = JSON.stringify(JSON.parse(next), null, 2)
  } catch {
    /* not JSON, use as-is */
  }

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div>
        <p className="text-xs font-semibold text-neutral-400 dark:text-slate-500 uppercase tracking-wider mb-1">
          Previous
        </p>
        <pre className="text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-2 text-red-700 dark:text-red-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {prevDisplay}
        </pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-neutral-400 dark:text-slate-500 uppercase tracking-wider mb-1">
          New Value
        </p>
        <pre className="text-xs bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-2 text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {nextDisplay}
        </pre>
      </div>
    </div>
  )
}

function AuditLogSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton className="w-3 h-3 rounded-full mt-1.5" />
            {i < 4 && <Skeleton className="w-0.5 flex-1 mt-1" />}
          </div>
          <div className="flex-1 pb-4">
            <Skeleton className="h-[88px] rounded-xl w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function InspectionAuditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<ActionFilter>("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  const fetchLogs = async (filter: ActionFilter, from: string, to: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== "all") params.set("action", filter)
      if (from) params.set("from", from)
      if (to) params.set("to", to)

      const qs = params.toString()
      const url = `/api/inspections/${id}/audit${qs ? `?${qs}` : ""}`
      const res = await fetch(url)

      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs ?? [])
        setTotal(data.total ?? 0)
      } else {
        setLogs([])
        setTotal(0)
      }
    } catch {
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs(activeFilter, fromDate, toDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeFilter])

  const handleDateFilter = () => {
    fetchLogs(activeFilter, fromDate, toDate)
  }

  const clearDateFilter = () => {
    setFromDate("")
    setToDate("")
    fetchLogs(activeFilter, "", "")
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/dashboard/inspections/${id}`}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Audit Log</h1>
            {!loading && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-300">
                {total} {total === 1 ? "record" : "records"}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
            Complete change history for this inspection
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="space-y-3">
        {/* Action type tabs */}
        <div className="flex gap-1 flex-wrap">
          {ACTION_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={activeFilter === tab.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                "text-xs h-8",
                activeFilter === tab.key
                  ? "bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600"
                  : ""
              )}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-neutral-500 dark:text-slate-400 whitespace-nowrap">From</label>
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-neutral-500 dark:text-slate-400 whitespace-nowrap">To</label>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDateFilter}>
            Apply
          </Button>
          {(fromDate || toDate) && (
            <Button size="sm" variant="ghost" className="text-xs h-8 text-neutral-400" onClick={clearDateFilter}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Timeline */}
      {loading ? (
        <AuditLogSkeleton />
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Clock size={40} className="text-neutral-300 dark:text-slate-600" />
          <p className="text-neutral-500 dark:text-slate-400 text-sm font-medium">
            No audit records found for this inspection
          </p>
          {(activeFilter !== "all" || fromDate || toDate) && (
            <p className="text-xs text-neutral-400 dark:text-slate-500">
              Try clearing the filters to see all records
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {logs.map((log, index) => {
            const isLast = index === logs.length - 1
            return (
              <div key={log.id} className="flex gap-4">
                {/* Timeline line + dot */}
                <div className="flex flex-col items-center flex-shrink-0 w-6">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full border-2 border-white dark:border-slate-950 flex-shrink-0 mt-4 z-10",
                      getTimelineDotColor(log.action)
                    )}
                  />
                  {!isLast && (
                    <div className="w-0.5 flex-1 bg-neutral-200 dark:bg-slate-700 mt-1" />
                  )}
                </div>

                {/* Card */}
                <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
                  <Card className="border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 shadow-none">
                    <CardContent className="p-4 space-y-2">
                      {/* Top row: action badge + timestamp */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border",
                            getActionColor(log.action)
                          )}
                        >
                          {log.action}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-slate-500 whitespace-nowrap">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>

                      {/* Entity info */}
                      {(log.entityType || log.entityId) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {log.entityType && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {log.entityType}
                            </Badge>
                          )}
                          {log.entityId && (
                            <span className="text-xs text-neutral-400 dark:text-slate-500 font-mono">
                              {log.entityId}
                            </span>
                          )}
                        </div>
                      )}

                      {/* User + Device + GPS row */}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500 dark:text-slate-400">
                        <span className="font-medium text-neutral-700 dark:text-slate-300">
                          User: <span className="font-mono">{log.userId}</span>
                        </span>
                        {log.device && (
                          <>
                            <span className="text-neutral-300 dark:text-slate-600">·</span>
                            <span>{log.device}</span>
                          </>
                        )}
                        {log.gpsLocation && (
                          <>
                            <span className="text-neutral-300 dark:text-slate-600">·</span>
                            <span>GPS: {log.gpsLocation}</span>
                          </>
                        )}
                      </div>

                      {/* Diff view */}
                      {(log.previousValue || log.newValue) && (
                        <DiffView previous={log.previousValue} next={log.newValue} />
                      )}

                      {/* Changes JSON (if no prev/new but changes exist) */}
                      {log.changes && !log.previousValue && !log.newValue && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-neutral-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                            Changes
                          </p>
                          <pre className="text-xs bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 rounded-lg p-2 text-neutral-600 dark:text-slate-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(log.changes), null, 2)
                              } catch {
                                return log.changes
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
