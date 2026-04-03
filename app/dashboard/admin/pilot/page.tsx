"use client"

/**
 * NIR Pilot Readiness Dashboard — Admin
 *
 * Route: /dashboard/admin/pilot
 * Auth:  ADMIN role required (enforced client-side + server-side via API)
 *
 * Visualises the output of GET /api/pilot/readiness.
 * The product lead uses this page to decide when to open a promotion PR
 * for each HYPOTHESIS claim in lib/nir-evidence-architecture.ts.
 *
 * Auto-refreshes every 5 minutes. Manual refresh available.
 */

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  BarChart2,
  Users,
  FileCheck,
  Zap,
  Info,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Types (mirrors nir-pilot-measurement.ts + readiness API response) ──────────

interface ClaimEvaluation {
  met: boolean
  summary: string
  metricValue: number | null
  threshold: number | string
  sufficientData: boolean
  observationsNeeded: number
}

interface EvidenceClaim {
  id: string
  title: string
  status: string
  hypothesis: string
}

interface ClaimCriteria {
  claimId: string
  description: string
  observationType: string
  minNirSampleSize: number
  minControlSampleSize: number
}

interface ClaimReadinessResult {
  claim: EvidenceClaim
  criteria: ClaimCriteria
  evaluation: ClaimEvaluation
  nirObservationCount: number
  controlObservationCount: number
  readyToPromote: boolean
}

interface PilotReport {
  generatedAt: string
  readyToPromote: ClaimReadinessResult[]
  inProgress: ClaimReadinessResult[]
  totalObservations: number
  actionItems: string[]
  pilotComplete: boolean
}

interface CycleTimeSummary {
  derivedFromInspections: number
  companies: number
  totalCompletedInspections: number
}

interface ReadinessMeta {
  generatedAt: string
  totalObservations: number
  manualObservations: number
  derivedObservations: number
  note: string[]
}

interface ReadinessResponse {
  report: PilotReport
  cycleTimeSummary: CycleTimeSummary
  meta: ReadinessMeta
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLAIM_ICONS: Record<string, React.ReactNode> = {
  "CLAIM-002": <BarChart2 size={16} />,
  "CLAIM-003": <FileCheck size={16} />,
  "CLAIM-004": <Clock size={16} />,
  "CLAIM-005": <Users size={16} />,
  "CLAIM-007": <Zap size={16} />,
}

const OBS_TYPE_LABELS: Record<string, string> = {
  cost_impact:        "Cost observations",
  reinspection_event: "Re-inspection events",
  adjuster_session:   "Adjuster sessions",
  technician_survey:  "Tech surveys",
  cycle_time:         "Cycle time records",
}

function ProgressBar({ value, max, colour }: { value: number; max: number; colour: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 w-full bg-neutral-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", colour)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function ClaimCard({ result }: { result: ClaimReadinessResult }) {
  const { claim, criteria, evaluation, nirObservationCount, controlObservationCount, readyToPromote } = result
  const needsControl = criteria.minControlSampleSize > 0

  const dataCollection = !evaluation.sufficientData
  const hasData        = evaluation.sufficientData && !evaluation.met
  const ready          = readyToPromote

  return (
    <Card className={cn(
      "border transition-all",
      ready
        ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20"
        : "border-neutral-200 dark:border-slate-800"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
              ready
                ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                : "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400"
            )}>
              {CLAIM_ICONS[claim.id] ?? <BarChart2 size={16} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-500 dark:text-slate-400 tracking-wider uppercase">
                  {claim.id}
                </span>
                {ready ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 text-[10px] py-0 px-1.5 border-0">
                    Ready to promote
                  </Badge>
                ) : dataCollection ? (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-neutral-500 dark:text-slate-400">
                    Collecting data
                  </Badge>
                ) : hasData ? (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60">
                    Threshold not met
                  </Badge>
                ) : null}
              </div>
              <CardTitle className="text-sm font-semibold text-neutral-800 dark:text-slate-200 mt-0.5">
                {claim.title}
              </CardTitle>
            </div>
          </div>
          {ready && (
            <CheckCircle2 className="flex-shrink-0 text-emerald-500" size={20} />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Hypothesis */}
        <p className="text-xs text-neutral-500 dark:text-slate-400 leading-relaxed">
          {claim.hypothesis}
        </p>

        {/* Observation progress */}
        <div className="space-y-2.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-slate-400">
                NIR {OBS_TYPE_LABELS[criteria.observationType] ?? criteria.observationType}
              </span>
              <span className={cn(
                "font-medium tabular-nums",
                nirObservationCount >= criteria.minNirSampleSize
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-neutral-600 dark:text-slate-400"
              )}>
                {nirObservationCount} / {criteria.minNirSampleSize}
              </span>
            </div>
            <ProgressBar
              value={nirObservationCount}
              max={criteria.minNirSampleSize}
              colour={nirObservationCount >= criteria.minNirSampleSize
                ? "bg-emerald-400"
                : "bg-cyan-400"}
            />
          </div>

          {needsControl && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600 dark:text-slate-400">
                  Control {OBS_TYPE_LABELS[criteria.observationType] ?? criteria.observationType}
                </span>
                <span className={cn(
                  "font-medium tabular-nums",
                  controlObservationCount >= criteria.minControlSampleSize
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-600 dark:text-slate-400"
                )}>
                  {controlObservationCount} / {criteria.minControlSampleSize}
                </span>
              </div>
              <ProgressBar
                value={controlObservationCount}
                max={criteria.minControlSampleSize}
                colour={controlObservationCount >= criteria.minControlSampleSize
                  ? "bg-emerald-400"
                  : "bg-violet-400"}
              />
            </div>
          )}
        </div>

        {/* Evaluation result */}
        {evaluation.sufficientData && (
          <div className={cn(
            "rounded-lg px-3 py-2.5 text-xs space-y-1",
            evaluation.met
              ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50"
              : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50"
          )}>
            {evaluation.metricValue !== null && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 dark:text-slate-400">Current metric</span>
                <span className="font-mono font-semibold text-neutral-800 dark:text-slate-200">
                  {typeof evaluation.metricValue === "number"
                    ? evaluation.metricValue.toFixed(2)
                    : evaluation.metricValue}
                  {" "}<span className="text-neutral-400 font-normal">vs threshold {evaluation.threshold}</span>
                </span>
              </div>
            )}
            <p className={cn(
              "leading-relaxed",
              evaluation.met
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            )}>
              {evaluation.summary}
            </p>
          </div>
        )}

        {!evaluation.sufficientData && evaluation.observationsNeeded > 0 && (
          <p className="text-xs text-neutral-400 dark:text-slate-500">
            <span className="font-medium text-neutral-600 dark:text-slate-400">
              {evaluation.observationsNeeded} more observations needed
            </span>{" "}
            before the statistical threshold can be evaluated.
          </p>
        )}

        {/* Claim-specific entry form links */}
        {claim.id === "CLAIM-002" && (
          <a
            href="/dashboard/admin/pilot/claim-002"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
          >
            Record cost observation <ArrowRight size={12} />
          </a>
        )}
        {claim.id === "CLAIM-003" && (
          <a
            href="/dashboard/admin/pilot/claim-003"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
          >
            Enter control group data <ArrowRight size={12} />
          </a>
        )}
        {claim.id === "CLAIM-004" && (
          <a
            href="/dashboard/admin/pilot/claim-004"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
          >
            Record adjuster sessions <ArrowRight size={12} />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PilotReadinessDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData]         = useState<ReadinessResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  useEffect(() => {
    if (status === "loading") return
    if (status === "unauthenticated") { router.push("/login"); return }
    if ((session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard"); return
    }
  }, [status, session, router])

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pilot/readiness")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const json = await res.json() as ReadinessResponse
      setData(json)
      setLastFetched(new Date())
    } catch {
      setError("Network error — could not load pilot readiness data.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (status === "authenticated") fetchData()
  }, [status, fetchData])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-neutral-400" size={28} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-3">
        <AlertTriangle className="mx-auto text-amber-500" size={36} />
        <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
          Could not load readiness data
        </p>
        <p className="text-xs text-neutral-500 dark:text-slate-400">{error}</p>
        <Button size="sm" variant="outline" onClick={() => fetchData()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { report, cycleTimeSummary, meta } = data
  const allClaims = [...report.readyToPromote, ...report.inProgress]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
              NIR Phase 2 Pilot
            </span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-slate-100">
            Readiness Dashboard
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            When a claim shows <span className="font-medium text-neutral-700 dark:text-slate-300">Ready to promote</span>,
            update <code className="text-xs bg-neutral-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">lib/nir-evidence-architecture.ts</code> and open a PR.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lastFetched && (
            <span className="text-xs text-neutral-400 dark:text-slate-500">
              Updated {lastFetched.toLocaleTimeString("en-AU")}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Overall status banner ────────────────────────────────────────────── */}
      {report.pilotComplete ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={24} />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Pilot complete — all HYPOTHESIS claims are ready for promotion
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              Open one PR per claim in <code className="font-mono">lib/nir-evidence-architecture.ts</code>{" "}
              to update each status to <code className="font-mono">VALIDATED</code>.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-slate-800 bg-neutral-50 dark:bg-slate-900/50 px-5 py-4 flex items-center gap-3">
          <TrendingUp className="text-cyan-500 flex-shrink-0" size={24} />
          <div>
            <p className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
              Pilot in progress —{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                {report.readyToPromote.length}
              </span>{" "}
              of {allClaims.length} claims ready
            </p>
            <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
              {meta.totalObservations} total observations ·{" "}
              {meta.manualObservations} manual · {meta.derivedObservations} auto-derived
            </p>
          </div>
        </div>
      )}

      {/* ── Summary stats row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Total observations"
          value={meta.totalObservations}
          sub="all claims"
          icon={<BarChart2 size={14} />}
        />
        <StatTile
          label="Claims ready"
          value={report.readyToPromote.length}
          sub={`of ${allClaims.length} total`}
          icon={<CheckCircle2 size={14} />}
          highlight={report.readyToPromote.length > 0}
        />
        <StatTile
          label="Completed inspections"
          value={cycleTimeSummary.totalCompletedInspections}
          sub={`${cycleTimeSummary.companies} companies`}
          icon={<FileCheck size={14} />}
        />
        <StatTile
          label="Cycle time records"
          value={cycleTimeSummary.derivedFromInspections}
          sub="auto-derived"
          icon={<Zap size={14} />}
        />
      </div>

      {/* ── Claim cards ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-300">
          Claim status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allClaims.map(result => (
            <ClaimCard key={result.claim.id} result={result} />
          ))}
        </div>
      </div>

      {/* ── Action items ─────────────────────────────────────────────────────── */}
      {report.actionItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-300">
            Action items
          </h2>
          <div className="rounded-xl border border-neutral-200 dark:border-slate-800 divide-y divide-neutral-100 dark:divide-slate-800 overflow-hidden">
            {report.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 bg-white dark:bg-slate-900">
                <ChevronRight size={14} className="flex-shrink-0 mt-0.5 text-cyan-500" />
                <p className="text-xs text-neutral-600 dark:text-slate-400 leading-relaxed">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ready to promote callout ──────────────────────────────────────────── */}
      {report.readyToPromote.length > 0 && (
        <div className="rounded-xl border border-cyan-200/60 dark:border-cyan-800/40 bg-cyan-50/40 dark:bg-cyan-950/20 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-cyan-600 dark:text-cyan-400" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
              Promotion checklist
            </p>
          </div>
          <ol className="space-y-1.5 text-xs text-neutral-600 dark:text-slate-400 list-decimal list-inside">
            <li>Review the underlying observations (sanity check for outliers)</li>
            <li>
              Open{" "}
              <code className="bg-neutral-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[11px]">
                lib/nir-evidence-architecture.ts
              </code>{" "}
              and set <code className="font-mono">status: &apos;VALIDATED&apos;</code>
            </li>
            <li>Fill in <code className="font-mono">validatedBy</code>, <code className="font-mono">validatedAt</code>, <code className="font-mono">validationNotes</code></li>
            <li>Open a PR — the diff IS the audit trail</li>
            <li>Once merged: update the evidence register with the PR URL as the source</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            {report.readyToPromote.map(r => (
              <Badge
                key={r.claim.id}
                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 border-0 gap-1"
              >
                <CheckCircle2 size={10} />
                {r.claim.id}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Notes from API ───────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-neutral-50 dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-slate-400">
          <Info size={12} />
          Notes
        </div>
        {meta.note.map((n, i) => (
          <p key={i} className="text-xs text-neutral-400 dark:text-slate-500 leading-relaxed">
            {n}
          </p>
        ))}
      </div>

    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  icon,
  highlight = false,
}: {
  label: string
  value: number
  sub: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className={cn(
      "rounded-xl border px-4 py-3 space-y-0.5",
      highlight
        ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20"
        : "border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900"
    )}>
      <div className={cn(
        "flex items-center gap-1.5 text-xs",
        highlight
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-neutral-500 dark:text-slate-400"
      )}>
        {icon}
        {label}
      </div>
      <div className={cn(
        "text-2xl font-bold tabular-nums",
        highlight
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-neutral-900 dark:text-slate-100"
      )}>
        {value}
      </div>
      <div className="text-xs text-neutral-400 dark:text-slate-500">{sub}</div>
    </div>
  )
}
