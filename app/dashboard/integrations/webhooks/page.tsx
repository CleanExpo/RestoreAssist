"use client"

import { useState, useEffect, useCallback } from "react"
import { Activity, RefreshCw, ChevronLeft, ChevronRight, Eye, RotateCcw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import toast from "react-hot-toast"

// ─── Types ────────────────────────────────────────────────────────────────────

type WebhookEventStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED"
type IntegrationProvider = "XERO" | "QUICKBOOKS" | "MYOB" | "SERVICEM8" | "ASCORA"

interface WebhookEvent {
  id: string
  provider: IntegrationProvider
  integrationId: string
  eventType: string
  payload: unknown
  signature: string | null
  status: WebhookEventStatus
  processedAt: string | null
  errorMessage: string | null
  retryCount: number
  createdAt: string
  updatedAt: string
  integration: {
    provider: IntegrationProvider
    status: string
  }
}

interface LogsResponse {
  events: WebhookEvent[]
  total: number
  page: number
  totalPages: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function providerColor(provider: IntegrationProvider): string {
  switch (provider) {
    case "XERO":       return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
    case "QUICKBOOKS": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
    case "MYOB":       return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
    case "SERVICEM8":  return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
    case "ASCORA":     return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400"
    default:           return "bg-neutral-100 text-neutral-700 dark:bg-slate-800 dark:text-slate-300"
  }
}

function statusColor(status: WebhookEventStatus): string {
  switch (status) {
    case "PROCESSED":  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    case "FAILED":     return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    case "PENDING":    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    case "PROCESSING": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
    case "IGNORED":    return "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400"
    default:           return "bg-neutral-100 text-neutral-600"
  }
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WebhookLogsPage() {
  const [data, setData] = useState<LogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [payloadEvent, setPayloadEvent] = useState<WebhookEvent | null>(null)

  // Filter state
  const [provider, setProvider] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (provider !== "all") params.set("provider", provider)
      if (status !== "all") params.set("status", status)
      if (from) params.set("from", from)
      if (to) params.set("to", to)

      const res = await fetch(`/api/webhooks/logs?${params}`)
      if (!res.ok) throw new Error("Failed to fetch logs")
      const json: LogsResponse = await res.json()
      setData(json)
    } catch (err) {
      console.error(err)
      toast.error("Failed to load webhook events")
    } finally {
      setLoading(false)
    }
  }, [page, provider, status, from, to])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [provider, status, from, to])

  async function handleRetry(event: WebhookEvent) {
    setRetryingId(event.id)
    try {
      const res = await fetch(`/api/webhooks/logs/${event.id}/retry`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Retry failed")
      toast.success("Event re-queued for processing")
      fetchLogs()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Retry failed")
    } finally {
      setRetryingId(null)
    }
  }

  // Compute stat card counts from current page data (or show 0 while loading)
  const events = data?.events ?? []
  const total = data?.total ?? 0

  // For stat cards we query summary counts independently — use current page snapshot as best effort
  const statCounts = {
    total,
    processed: events.filter((e) => e.status === "PROCESSED").length,
    failed: events.filter((e) => e.status === "FAILED").length,
    pending: events.filter((e) => e.status === "PENDING").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-slate-50">Webhook Event Log</h1>
            <p className="text-sm text-neutral-500 dark:text-slate-400">
              Inbound events from connected integrations
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Events",  value: total,                color: "text-neutral-900 dark:text-slate-50" },
          { label: "Processed",     value: statCounts.processed, color: "text-green-600 dark:text-green-400" },
          { label: "Failed",        value: statCounts.failed,    color: "text-red-600 dark:text-red-400" },
          { label: "Pending",       value: statCounts.pending,   color: "text-yellow-600 dark:text-yellow-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border border-neutral-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <Card className="border border-neutral-200 dark:border-slate-800">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Provider */}
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="XERO">Xero</SelectItem>
                  <SelectItem value="QUICKBOOKS">QuickBooks</SelectItem>
                  <SelectItem value="MYOB">MYOB</SelectItem>
                  <SelectItem value="SERVICEM8">ServiceM8</SelectItem>
                  <SelectItem value="ASCORA">Ascora</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1 min-w-[150px]">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="PROCESSED">Processed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="IGNORED">Ignored</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-md border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 text-neutral-900 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-md border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 text-neutral-900 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            {/* Clear filters */}
            {(provider !== "all" || status !== "all" || from || to) && (
              <Button
                variant="ghost"
                size="sm"
                className="self-end text-neutral-500 dark:text-slate-400"
                onClick={() => {
                  setProvider("all")
                  setStatus("all")
                  setFrom("")
                  setTo("")
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card className="border border-neutral-200 dark:border-slate-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-neutral-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Activity size={40} className="text-neutral-300 dark:text-slate-700 mb-4" />
              <p className="text-neutral-500 dark:text-slate-400 text-sm max-w-sm">
                No webhook events recorded yet. Events appear here when integrations send data.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-neutral-200 dark:border-slate-800">
                  <TableHead className="w-[140px]">Time</TableHead>
                  <TableHead className="w-[110px]">Provider</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[80px] text-center">Retries</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.id}
                    className="border-b border-neutral-100 dark:border-slate-800/60 hover:bg-neutral-50 dark:hover:bg-slate-900/40"
                  >
                    {/* Time */}
                    <TableCell className="text-sm text-neutral-500 dark:text-slate-400 whitespace-nowrap">
                      {relativeTime(event.createdAt)}
                    </TableCell>

                    {/* Provider Badge */}
                    <TableCell>
                      <Badge className={`text-xs font-medium ${providerColor(event.provider)}`}>
                        {event.provider === "QUICKBOOKS"
                          ? "QuickBooks"
                          : event.provider.charAt(0) + event.provider.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>

                    {/* Event Type */}
                    <TableCell>
                      <code className="text-xs font-mono bg-neutral-100 dark:bg-slate-800 text-neutral-700 dark:text-slate-300 px-2 py-0.5 rounded">
                        {event.eventType}
                      </code>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      <Badge className={`text-xs font-medium ${statusColor(event.status)}`}>
                        {event.status}
                      </Badge>
                    </TableCell>

                    {/* Retry Count */}
                    <TableCell className="text-center text-sm text-neutral-500 dark:text-slate-400">
                      {event.retryCount}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {event.status === "FAILED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                            disabled={retryingId === event.id}
                            onClick={() => handleRetry(event)}
                          >
                            <RotateCcw size={13} className={retryingId === event.id ? "animate-spin" : ""} />
                            <span className="ml-1">Retry</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-neutral-600 hover:text-neutral-700 dark:text-slate-400 dark:hover:text-slate-200"
                          onClick={() => setPayloadEvent(event)}
                        >
                          <Eye size={13} />
                          <span className="ml-1">Payload</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500 dark:text-slate-400">
            Page {data.page} of {data.totalPages} &middot; {data.total} total events
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1 || loading}
            >
              <ChevronLeft size={16} />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={data.page >= data.totalPages || loading}
            >
              Next
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Payload Viewer Dialog */}
      <Dialog open={!!payloadEvent} onOpenChange={(open) => !open && setPayloadEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye size={16} />
              Webhook Payload
              {payloadEvent && (
                <Badge className={`ml-2 text-xs ${providerColor(payloadEvent.provider)}`}>
                  {payloadEvent.provider}
                </Badge>
              )}
            </DialogTitle>
            {payloadEvent && (
              <p className="text-xs text-neutral-500 dark:text-slate-400 mt-1">
                <code className="font-mono bg-neutral-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {payloadEvent.eventType}
                </code>
                {" — "}
                {relativeTime(payloadEvent.createdAt)}
              </p>
            )}
          </DialogHeader>

          {payloadEvent && (
            <div className="flex-1 overflow-auto mt-2">
              {payloadEvent.errorMessage && (
                <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <span className="font-semibold">Error:</span> {payloadEvent.errorMessage}
                </div>
              )}
              <pre className="text-xs font-mono bg-neutral-50 dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-lg p-4 overflow-auto whitespace-pre-wrap break-words leading-relaxed">
                {JSON.stringify(payloadEvent.payload, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
