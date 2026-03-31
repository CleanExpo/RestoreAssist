"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle, WifiOff } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

// ─── Types ────────────────────────────────────────────────────────────────────

type ProviderSlug = "xero" | "quickbooks" | "myob" | "servicem8" | "ascora"

interface HealthCheck {
  name: string
  status: "pass" | "warn" | "fail"
  message: string
  details?: unknown
}

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy"
  checks: HealthCheck[]
  summary: { total: number; passed: number; warned: number; failed: number }
  timestamp: string
}

interface ProviderMetric {
  status: string
  lastSyncAt: string | null
  totalSyncs: number
  successfulSyncs: number
  failedSyncs: number
  successRate: number
}

interface CircuitBreakerStat {
  name: string
  state: "CLOSED" | "OPEN" | "HALF_OPEN"
  failureCount: number
  successCount: number
  recentRequests: number
}

interface RateLimiterStat {
  key: string
  availableTokens: number
  maxBurst: number
  tokensPerMinute: number
}

interface MetricsData {
  success: boolean
  integrations: {
    total: number
    connected: number
    disconnected: number
    error: number
    byProvider: Record<string, ProviderMetric>
  }
  syncs: {
    total: number
    successful: number
    failed: number
    successRate: number
    avgDurationMs: number
  }
  circuitBreakers: CircuitBreakerStat[]
  rateLimiters: RateLimiterStat[]
  timestamp: string
}

interface SyncErrorItem {
  id: string
  syncType: string
  status: string
  errorMessage?: string | null
  retryCount?: number
  startedAt: string
  integration: {
    provider: string
    name: string | null
  }
}

interface SyncErrorsData {
  success: boolean
  syncErrors: SyncErrorItem[]
  webhookErrors: {
    id: string
    eventType: string
    status: string
    retryCount: number
    createdAt: string
    integration: { provider: string; name: string | null }
  }[]
  pagination: { total: number; limit: number; offset: number; hasMore: boolean }
}

// ─── Provider config ──────────────────────────────────────────────────────────

const PROVIDERS: { slug: ProviderSlug; name: string; color: string }[] = [
  { slug: "xero", name: "Xero", color: "#13B5EA" },
  { slug: "quickbooks", name: "QuickBooks", color: "#2CA01C" },
  { slug: "myob", name: "MYOB", color: "#8B0000" },
  { slug: "servicem8", name: "ServiceM8", color: "#F36F21" },
  { slug: "ascora", name: "Ascora", color: "#1E3A5F" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function providerStatusFromMetric(metric: ProviderMetric | undefined): "HEALTHY" | "DEGRADED" | "DOWN" | "NOT_CONNECTED" {
  if (!metric) return "NOT_CONNECTED"
  if (metric.status === "DISCONNECTED") return "NOT_CONNECTED"
  if (metric.status === "ERROR") return "DOWN"
  if (metric.successRate < 80) return "DEGRADED"
  return "HEALTHY"
}

function circuitBreakerForProvider(
  circuitBreakers: CircuitBreakerStat[],
  providerSlug: string
): CircuitBreakerStat | undefined {
  return circuitBreakers.find(cb =>
    cb.name.toLowerCase().includes(providerSlug.toLowerCase())
  )
}

function rateLimiterForProvider(
  rateLimiters: RateLimiterStat[],
  providerSlug: string
): RateLimiterStat | undefined {
  return rateLimiters.find(rl =>
    rl.key.toLowerCase().includes(providerSlug.toLowerCase())
  )
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "HEALTHY" | "DEGRADED" | "DOWN" | "NOT_CONNECTED" }) {
  const variants: Record<typeof status, { label: string; className: string }> = {
    HEALTHY: { label: "Healthy", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    DEGRADED: { label: "Degraded", className: "bg-amber-100 text-amber-800 border-amber-200" },
    DOWN: { label: "Down", className: "bg-red-100 text-red-800 border-red-200" },
    NOT_CONNECTED: { label: "Not Connected", className: "bg-gray-100 text-gray-600 border-gray-200" },
  }
  const v = variants[status]
  return (
    <Badge className={`text-xs font-medium border ${v.className}`}>
      {v.label}
    </Badge>
  )
}

function CircuitBadge({ state }: { state: "CLOSED" | "OPEN" | "HALF_OPEN" | undefined }) {
  if (!state) return <span className="text-xs text-muted-foreground">—</span>
  const map: Record<string, { label: string; className: string }> = {
    CLOSED: { label: "Closed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    OPEN: { label: "Open", className: "bg-red-100 text-red-800 border-red-200" },
    HALF_OPEN: { label: "Half-Open", className: "bg-amber-100 text-amber-800 border-amber-200" },
  }
  const v = map[state] ?? { label: state, className: "bg-gray-100 text-gray-600 border-gray-200" }
  return (
    <Badge className={`text-xs font-medium border ${v.className}`}>
      {v.label}
    </Badge>
  )
}

function TokenValidityRow({
  providerSlug,
  healthData,
}: {
  providerSlug: string
  healthData: HealthData | null
}) {
  if (!healthData) return <span className="text-xs text-muted-foreground">—</span>

  const tokenCheck = healthData.checks.find(c => c.name === "Token Validity")
  if (!tokenCheck) return <span className="text-xs text-muted-foreground">—</span>

  const details = tokenCheck.details as { provider: string; expiredAt: string }[] | undefined
  const expired = Array.isArray(details) && details.some(
    d => d.provider.toLowerCase() === providerSlug.toLowerCase()
  )

  if (expired) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <XCircle className="h-3 w-3" /> Expired
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> Valid
    </span>
  )
}

function RateLimiterBar({ rl }: { rl: RateLimiterStat | undefined }) {
  if (!rl) return <span className="text-xs text-muted-foreground">—</span>
  const pct = rl.maxBurst > 0 ? Math.round((rl.availableTokens / rl.maxBurst) * 100) : 0
  const barColor = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {rl.availableTokens} / {rl.maxBurst} tokens remaining
      </p>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ProviderCard({
  provider,
  metric,
  healthData,
  circuitBreaker,
  rateLimiter,
  onRetry,
  retrying,
}: {
  provider: { slug: ProviderSlug; name: string; color: string }
  metric: ProviderMetric | undefined
  healthData: HealthData | null
  circuitBreaker: CircuitBreakerStat | undefined
  rateLimiter: RateLimiterStat | undefined
  onRetry: (slug: ProviderSlug) => void
  retrying: boolean
}) {
  const overallStatus = providerStatusFromMetric(metric)
  const showRetry = overallStatus === "DOWN" || overallStatus === "DEGRADED"

  return (
    <Card className="flex flex-col gap-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {/* Logo placeholder coloured dot */}
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: provider.color }}
            >
              {provider.name.slice(0, 2).toUpperCase()}
            </div>
            <CardTitle className="text-base">{provider.name}</CardTitle>
          </div>
          <StatusBadge status={overallStatus} />
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3 flex-1">
        {/* Token validity */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Token</span>
          <TokenValidityRow providerSlug={provider.slug} healthData={healthData} />
        </div>

        {/* Circuit breaker */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Circuit Breaker</span>
          <CircuitBadge state={circuitBreaker?.state} />
        </div>

        {/* Rate limiter */}
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Rate Limiter</span>
          <RateLimiterBar rl={rateLimiter} />
        </div>

        {/* Sync stats */}
        {metric && metric.status !== "DISCONNECTED" && (
          <>
            <Separator />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Syncs</p>
                <p className="text-sm font-semibold">{metric.totalSyncs}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Success</p>
                <p className="text-sm font-semibold text-emerald-600">{metric.successfulSyncs}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-sm font-semibold text-red-600">{metric.failedSyncs}</p>
              </div>
            </div>
          </>
        )}

        {/* Retry button */}
        {showRetry && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1 text-xs"
            disabled={retrying}
            onClick={() => onRetry(provider.slug)}
          >
            {retrying ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                Retrying…
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Retry Failed Syncs
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ProviderCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-5 w-28" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationHealthPage() {
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null)
  const [errorsData, setErrorsData] = useState<SyncErrorsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [allFailed, setAllFailed] = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [retryingProvider, setRetryingProvider] = useState<ProviderSlug | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setAllFailed(false)
    try {
      const [healthRes, metricsRes, errorsRes] = await Promise.allSettled([
        fetch("/api/integrations/health").then(r => r.json()),
        fetch("/api/integrations/metrics").then(r => r.json()),
        fetch("/api/integrations/sync-errors").then(r => r.json()),
      ])

      let anySuccess = false

      if (healthRes.status === "fulfilled" && !healthRes.value?.error) {
        setHealthData(healthRes.value as HealthData)
        anySuccess = true
      }
      if (metricsRes.status === "fulfilled" && metricsRes.value?.success) {
        setMetricsData(metricsRes.value as MetricsData)
        anySuccess = true
      }
      if (errorsRes.status === "fulfilled" && errorsRes.value?.success) {
        setErrorsData(errorsRes.value as SyncErrorsData)
        anySuccess = true
      }

      if (!anySuccess) {
        setAllFailed(true)
      } else {
        setLastChecked(new Date().toLocaleTimeString())
      }
    } catch {
      setAllFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleRetry = async (slug: ProviderSlug) => {
    setRetryingProvider(slug)
    try {
      await fetch("/api/integrations/nir-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: slug }),
      })
    } catch {
      // fire-and-forget, ignore errors
    } finally {
      setRetryingProvider(null)
      // Re-fetch after short delay to pick up new data
      setTimeout(() => fetchAll(), 2000)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const byProvider = metricsData?.integrations?.byProvider ?? {}
  const circuitBreakers = metricsData?.circuitBreakers ?? []
  const rateLimiters = metricsData?.rateLimiters ?? []
  const syncs = metricsData?.syncs
  const syncErrors = errorsData?.syncErrors ?? []
  const webhookErrors = errorsData?.webhookErrors ?? []
  const allErrors = [
    ...syncErrors.map(e => ({
      id: e.id,
      provider: e.integration.provider,
      message: e.errorMessage ?? e.syncType,
      timestamp: e.startedAt,
      retryCount: e.retryCount ?? 0,
      type: "Sync" as const,
    })),
    ...webhookErrors.map(e => ({
      id: e.id,
      provider: e.integration.provider,
      message: e.eventType,
      timestamp: e.createdAt,
      retryCount: e.retryCount,
      type: "Webhook" as const,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Back link + title row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/dashboard/integrations"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Integrations
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Integration Health</h1>
          {lastChecked && !loading && (
            <p className="text-sm text-muted-foreground">Last checked at {lastChecked}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAll}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Checking…" : "Refresh"}
        </Button>
      </div>

      {/* All-failed error state */}
      {allFailed && !loading && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <WifiOff className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">
              Unable to load integration health data. Check your connection.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overall health status banner (from /health endpoint) */}
      {!loading && healthData && (
        <Card
          className={
            healthData.status === "healthy"
              ? "border-emerald-200 bg-emerald-50"
              : healthData.status === "degraded"
              ? "border-amber-200 bg-amber-50"
              : "border-red-200 bg-red-50"
          }
        >
          <CardContent className="flex items-center justify-between py-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {healthData.status === "healthy" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : healthData.status === "degraded" ? (
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 shrink-0" />
              )}
              <div>
                <p
                  className={`font-semibold capitalize ${
                    healthData.status === "healthy"
                      ? "text-emerald-800"
                      : healthData.status === "degraded"
                      ? "text-amber-800"
                      : "text-red-800"
                  }`}
                >
                  System {healthData.status.charAt(0).toUpperCase() + healthData.status.slice(1)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {healthData.summary.passed}/{healthData.summary.total} checks passing
                  {healthData.summary.warned > 0 && ` · ${healthData.summary.warned} warning${healthData.summary.warned > 1 ? "s" : ""}`}
                  {healthData.summary.failed > 0 && ` · ${healthData.summary.failed} failure${healthData.summary.failed > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{formatTimestamp(healthData.timestamp)}</p>
          </CardContent>
        </Card>
      )}

      {/* Per-provider health cards */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Provider Status</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <ProviderCardSkeleton key={i} />)
            : PROVIDERS.map(p => {
                const metricKey = Object.keys(byProvider).find(
                  k => k.toLowerCase() === p.slug.toUpperCase().toLowerCase() || k.toUpperCase() === p.slug.toUpperCase()
                )
                const metric = metricKey ? byProvider[metricKey] : undefined
                return (
                  <ProviderCard
                    key={p.slug}
                    provider={p}
                    metric={metric}
                    healthData={healthData}
                    circuitBreaker={circuitBreakerForProvider(circuitBreakers, p.slug)}
                    rateLimiter={rateLimiterForProvider(rateLimiters, p.slug)}
                    onRetry={handleRetry}
                    retrying={retryingProvider === p.slug}
                  />
                )
              })}
        </div>
      </section>

      {/* Overall metrics strip */}
      {!loading && syncs && (
        <>
          <Separator />
          <section>
            <h2 className="text-lg font-semibold mb-3">Overall Metrics (last 24h)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold">{syncs.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Syncs</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {syncs.successRate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Success Rate</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{syncs.failed}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Failed Syncs</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold">{formatDuration(syncs.avgDurationMs)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Avg Duration</p>
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}

      {loading && (
        <>
          <Separator />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </>
      )}

      {/* Failed syncs table */}
      <Separator />
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Failed Syncs
          {!loading && allErrors.length > 0 && (
            <Badge variant="destructive" className="ml-2 text-xs">
              {allErrors.length}
            </Badge>
          )}
        </h2>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : allErrors.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="text-sm">No failed syncs — all clear.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Provider</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Error</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Time</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Retries</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allErrors.map(err => (
                  <tr key={err.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {err.provider}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Badge variant="outline" className="text-xs">
                        {err.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">
                      {err.message || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(err.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge
                        variant={err.retryCount >= 5 ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {err.retryCount}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
