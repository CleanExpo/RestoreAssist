"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, RefreshCw, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncErrorIntegration {
  id: string
  provider: string
  name: string
  status: string
}

interface SyncError {
  id: string
  integrationId: string
  integration: SyncErrorIntegration
  syncType: string
  status: string
  recordsProcessed: number
  recordsFailed: number
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
}

interface WebhookError {
  id: string
  integrationId: string
  integration: SyncErrorIntegration
  eventType: string
  status: string
  errorMessage: string | null
  retryCount: number
  createdAt: string
}

interface SyncErrorsResponse {
  success: boolean
  syncErrors: SyncError[]
  webhookErrors: WebhookError[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROVIDER_COLOURS: Record<string, string> = {
  xero: "bg-blue-100 text-blue-800 border-blue-200",
  quickbooks: "bg-green-100 text-green-800 border-green-200",
  myob: "bg-purple-100 text-purple-800 border-purple-200",
  servicem8: "bg-orange-100 text-orange-800 border-orange-200",
  ascora: "bg-indigo-100 text-indigo-800 border-indigo-200",
}

const PROVIDER_LABEL: Record<string, string> = {
  xero: "Xero",
  quickbooks: "QuickBooks",
  myob: "MYOB",
  servicem8: "ServiceM8",
  ascora: "Ascora",
}

const STATUS_STYLES: Record<string, string> = {
  FAILED: "bg-red-100 text-red-800 border-red-200",
  PARTIAL: "bg-amber-100 text-amber-800 border-amber-200",
  SUCCESS: "bg-green-100 text-green-800 border-green-200",
  // Webhook statuses
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  PROCESSING: "bg-blue-100 text-blue-800 border-blue-200",
  DELIVERED: "bg-green-100 text-green-800 border-green-200",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function truncate(str: string | null | undefined, max = 80) {
  if (!str) return "—"
  return str.length <= max ? str : str.slice(0, max)
}

function providerLabel(provider: string) {
  return PROVIDER_LABEL[provider.toLowerCase()] ?? provider
}

// ─── Row component with "Show more" toggle ────────────────────────────────────

interface SyncErrorRowProps {
  error: SyncError
  onRetry: (integrationId: string, syncLogId: string) => Promise<void>
  retryingId: string | null
}

function SyncErrorRow({ error, onRetry, retryingId }: SyncErrorRowProps) {
  const [expanded, setExpanded] = useState(false)
  const msg = error.errorMessage ?? null
  const isTruncated = msg !== null && msg.length > 80
  const providerKey = error.integration.provider.toLowerCase()
  const isRetrying = retryingId === error.id
  const isPermanentlyFailed = error.recordsFailed >= 5

  return (
    <TableRow>
      {/* Provider */}
      <TableCell>
        <Badge
          variant="outline"
          className={`text-xs font-medium ${PROVIDER_COLOURS[providerKey] ?? "bg-gray-100 text-gray-800 border-gray-200"}`}
        >
          {providerLabel(error.integration.provider)}
        </Badge>
      </TableCell>

      {/* Error message */}
      <TableCell className="max-w-xs">
        <span className="text-sm text-gray-700">
          {expanded || !isTruncated ? (msg ?? "—") : truncate(msg)}
        </span>
        {isTruncated && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-2 inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 underline"
            aria-label={expanded ? "Show less" : "Show more"}
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Show less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show more</>
            )}
          </button>
        )}
      </TableCell>

      {/* Sync type */}
      <TableCell>
        <span className="text-xs font-mono text-gray-600">{error.syncType}</span>
      </TableCell>

      {/* Timestamp */}
      <TableCell>
        <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(error.startedAt)}</span>
      </TableCell>

      {/* Records failed / processed */}
      <TableCell className="text-center">
        <span className="text-sm font-medium text-red-700">{error.recordsFailed}</span>
        <span className="text-xs text-gray-400"> / {error.recordsProcessed}</span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge
          variant="outline"
          className={`text-xs ${STATUS_STYLES[error.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
        >
          {error.status}
        </Badge>
      </TableCell>

      {/* Retry action */}
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={isPermanentlyFailed || isRetrying}
          onClick={() => onRetry(error.integrationId, error.id)}
          className="h-7 text-xs"
        >
          {isRetrying ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Retrying…</>
          ) : (
            <><RefreshCw className="h-3 w-3 mr-1" /> Retry</>
          )}
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ─── Webhook error row ────────────────────────────────────────────────────────

interface WebhookErrorRowProps {
  error: WebhookError
}

function WebhookErrorRow({ error }: WebhookErrorRowProps) {
  const [expanded, setExpanded] = useState(false)
  const msg = error.errorMessage ?? null
  const isTruncated = msg !== null && msg.length > 80
  const providerKey = error.integration.provider.toLowerCase()

  return (
    <TableRow className="bg-amber-50/40">
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className={`text-xs font-medium w-fit ${PROVIDER_COLOURS[providerKey] ?? "bg-gray-100 text-gray-800 border-gray-200"}`}
          >
            {providerLabel(error.integration.provider)}
          </Badge>
          <span className="text-[10px] text-amber-700 font-medium">WEBHOOK</span>
        </div>
      </TableCell>

      <TableCell className="max-w-xs">
        <span className="text-sm text-gray-700">
          {expanded || !isTruncated ? (msg ?? "—") : truncate(msg)}
        </span>
        {isTruncated && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-2 inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Show less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show more</>
            )}
          </button>
        )}
      </TableCell>

      <TableCell>
        <span className="text-xs font-mono text-gray-600">{error.eventType}</span>
      </TableCell>

      <TableCell>
        <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(error.createdAt)}</span>
      </TableCell>

      <TableCell className="text-center">
        <span className="text-sm font-medium text-amber-700">{error.retryCount}</span>
        <span className="text-xs text-gray-400"> / 5</span>
      </TableCell>

      <TableCell>
        <Badge
          variant="outline"
          className={`text-xs ${STATUS_STYLES[error.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
        >
          {error.status}
        </Badge>
      </TableCell>

      {/* No retry for maxed-out webhook errors */}
      <TableCell>
        <Button size="sm" variant="outline" disabled className="h-7 text-xs opacity-50">
          Max retries
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-10" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-7 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = "ALL" | "FAILED" | "PARTIAL" | "SUCCESS" | "WEBHOOK"

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: "All", value: "ALL" },
  { label: "Failed", value: "FAILED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Resolved", value: "SUCCESS" },
  { label: "Webhooks", value: "WEBHOOK" },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SyncErrorsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([])
  const [webhookErrors, setWebhookErrors] = useState<WebhookError[]>([])
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL")
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchErrors = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch("/api/integrations/sync-errors")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SyncErrorsResponse = await res.json()
      if (data.success) {
        setSyncErrors(data.syncErrors ?? [])
        setWebhookErrors(data.webhookErrors ?? [])
      } else {
        setFetchError("Failed to load sync errors.")
      }
    } catch (err: any) {
      setFetchError(err.message ?? "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchErrors()
  }, [fetchErrors])

  // ── Retry ──────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(async (integrationId: string, syncLogId: string) => {
    setRetryingId(syncLogId)
    try {
      // Re-trigger the NIR sync for the specific integration.
      // targetIntegrationId scopes the sync to the single failed integration.
      const res = await fetch(`/api/integrations/nir-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetIntegrationId: integrationId, syncLogId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // Refresh list after successful retry
      await fetchErrors()
    } catch (err: any) {
      console.error("[Retry]", err)
      alert(`Retry failed: ${err.message}`)
    } finally {
      setRetryingId(null)
    }
  }, [fetchErrors])

  // ── Clear resolved ──────────────────────────────────────────────────────────

  const handleClearResolved = useCallback(async () => {
    // Optimistically remove SUCCESS entries from local state
    setSyncErrors(prev => prev.filter(e => e.status !== "SUCCESS"))
    setClearing(true)
    try {
      // Call DELETE to purge old error logs on the server (best-effort)
      await fetch("/api/integrations/sync-errors", { method: "DELETE" })
    } catch {
      // Silent — local state already updated
    } finally {
      setClearing(false)
    }
  }, [])

  // ── Derived state ───────────────────────────────────────────────────────────

  const filteredSyncErrors = syncErrors.filter(e => {
    if (activeTab === "ALL") return true
    if (activeTab === "WEBHOOK") return false
    return e.status === activeTab
  })

  const showWebhooks = activeTab === "ALL" || activeTab === "WEBHOOK"
  const totalErrorCount =
    syncErrors.filter(e => e.status === "FAILED").length + webhookErrors.length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">

        {/* Back link */}
        <button
          onClick={() => router.push("/dashboard/integrations")}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Integrations
        </button>

        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">Sync Errors</h1>
            {!loading && (
              <Badge
                variant="outline"
                className={`text-sm font-medium px-2.5 py-0.5 ${
                  totalErrorCount > 0
                    ? "bg-red-100 text-red-800 border-red-300"
                    : "bg-green-100 text-green-800 border-green-300"
                }`}
              >
                {totalErrorCount > 0
                  ? `${totalErrorCount} error${totalErrorCount !== 1 ? "s" : ""}`
                  : "Healthy"}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearResolved}
              disabled={clearing || loading}
              className="h-8 text-xs"
            >
              {clearing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Clear Resolved
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchErrors}
              disabled={loading}
              className="h-8 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                activeTab === tab.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Fetch error banner */}
        {fetchError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {fetchError}
            <button
              onClick={fetchErrors}
              className="ml-auto underline text-red-600 hover:text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-32">Provider</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="w-28">Sync Type</TableHead>
                <TableHead className="w-40">Timestamp</TableHead>
                <TableHead className="w-24 text-center">Records</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : filteredSyncErrors.length === 0 &&
                (!showWebhooks || webhookErrors.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <CheckCircle2 className="h-10 w-10 text-green-500" />
                      <p className="text-base font-medium text-gray-700">
                        No sync errors — all integrations healthy
                      </p>
                      <p className="text-sm text-gray-400">
                        Sync logs will appear here when errors occur.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredSyncErrors.map(error => (
                    <SyncErrorRow
                      key={error.id}
                      error={error}
                      onRetry={handleRetry}
                      retryingId={retryingId}
                    />
                  ))}
                  {showWebhooks &&
                    webhookErrors.map(error => (
                      <WebhookErrorRow key={error.id} error={error} />
                    ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer count */}
        {!loading && (syncErrors.length > 0 || webhookErrors.length > 0) && (
          <p className="mt-3 text-xs text-gray-400 text-right">
            {syncErrors.length} sync log{syncErrors.length !== 1 ? "s" : ""} &middot;{" "}
            {webhookErrors.length} webhook error{webhookErrors.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  )
}
