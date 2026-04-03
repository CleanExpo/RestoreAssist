"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  ClipboardCheck,
  FileText,
  Download,
} from "lucide-react"
import { cn } from "@/lib/utils"
import toast from "react-hot-toast"

interface Section {
  name: string
  score: number
  status: "complete" | "partial" | "missing"
  issues: string[]
}
interface CompletenessResult {
  reportId: string
  reportTitle: string
  overallScore: number
  sections: Section[]
}

/* ── Score Ring ── */
function ScoreRing({ score }: { score: number }) {
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color =
    score >= 80
      ? { stroke: "#22c55e", text: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20" }
      : score >= 50
        ? { stroke: "#f59e0b", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" }
        : { stroke: "#ef4444", text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20" }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("relative rounded-full p-3", color.bg)}>
        <svg width={180} height={180} className="transform -rotate-90">
          <circle cx={90} cy={90} r={radius} stroke="currentColor" strokeWidth={12} fill="none" className="text-slate-200 dark:text-slate-700" />
          <circle cx={90} cy={90} r={radius} stroke={color.stroke} strokeWidth={12} fill="none"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-1000 ease-out" />
        </svg>        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-4xl font-bold", color.text)}>{score}%</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">Complete</span>
        </div>
      </div>
    </div>
  )
}

/* ── Fix-link helper ── */
function getFixLink(sectionName: string, reportId: string): string | null {
  const map: Record<string, string> = {
    "Client Information": "/dashboard/clients",
    "Inspection Data": `/dashboard/inspections`,
    "IICRC Classification": `/dashboard/reports/${reportId}?tab=classification`,
    "Scope of Works": `/dashboard/reports/${reportId}?tab=scope`,
    "Cost Estimates": `/dashboard/reports/${reportId}?tab=costs`,
    "Site Photos": `/dashboard/inspections`,
  }
  return map[sectionName] ?? null
}

/* ── Section Card ── */
function SectionCard({ section, reportId }: { section: Section; reportId: string }) {
  const cfg = {
    complete: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400", badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", label: "Complete" },
    partial: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", label: "Partial" },
    missing: { icon: XCircle, color: "text-red-600 dark:text-red-400", badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", label: "Missing" },
  }[section.status]
  const StatusIcon = cfg.icon
  const barColor = section.score >= 80 ? "bg-green-500" : section.score >= 50 ? "bg-amber-500" : "bg-red-500"
  const fixLink = getFixLink(section.name, reportId)

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">{section.name}</CardTitle>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0", cfg.badge)}>
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Score</span>
            <span className="font-medium">{section.score}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${section.score}%` }} />
          </div>
        </div>
        {section.issues.length > 0 ? (
          <ul className="flex flex-col gap-1.5 flex-1">
            {section.issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <span className="mt-0.5 shrink-0 text-red-400">&#x2022;</span>
                {issue}
              </li>
            ))}
          </ul>        ) : (
          <p className="text-xs text-green-600 dark:text-green-400 flex-1">All checks passed</p>
        )}
        {fixLink && section.status !== "complete" && (
          <Link href={fixLink} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mt-auto pt-1">
            Fix this <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Skeleton ── */
function SectionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
        <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </CardContent>
    </Card>
  )
}
/* ── Main Page ── */
export default function ReportCompletenessPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const reportId = params.id

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<CompletenessResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/reports/completeness-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Completeness check failed")
      }
      const data: CompletenessResult = await res.json()
      setResult(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [reportId])
  useEffect(() => {
    runCheck()
  }, [runCheck])

  /* ── Summary stats ── */
  const completeSections = result?.sections.filter((s) => s.status === "complete").length ?? 0
  const partialSections = result?.sections.filter((s) => s.status === "partial").length ?? 0
  const missingSections = result?.sections.filter((s) => s.status === "missing").length ?? 0
  const totalSections = result?.sections.length ?? 0

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Navigation + Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/reports/${reportId}`)} className="shrink-0 mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Completeness Audit</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {result ? result.reportTitle : "Loading report..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto sm:ml-0">            <Button variant="outline" size="sm" onClick={runCheck} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Re-check
            </Button>
            <Link href={`/dashboard/reports/${reportId}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                View Report
              </Button>
            </Link>
            <Link href={`/dashboard/reports/${reportId}/download`}>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
            </Link>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="h-52 w-52 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SectionSkeleton key={i} />)}
            </div>
          </div>
        )}
        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-red-200 dark:border-red-800 py-16 text-center">
            <XCircle className="h-12 w-12 text-red-300 dark:text-red-600 mb-4" />
            <h2 className="text-base font-semibold text-red-600 dark:text-red-400">{error}</h2>
            <Button variant="outline" size="sm" onClick={runCheck} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" /> Try Again
            </Button>
          </div>
        )}

        {/* Results */}
        {!loading && result && (
          <div className="space-y-8">
            {/* Score ring + summary badges */}
            <div className="flex flex-col items-center gap-4">
              <ScoreRing score={result.overallScore} />

              <div className="flex items-center gap-3 flex-wrap justify-center">
                {result.overallScore >= 80 && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Ready to submit
                  </Badge>
                )}
                {result.overallScore >= 50 && result.overallScore < 80 && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                    <AlertTriangle className="mr-1 h-3 w-3" /> Some sections need attention
                  </Badge>
                )}                {result.overallScore < 50 && (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">
                    <XCircle className="mr-1 h-3 w-3" /> Significant gaps found
                  </Badge>
                )}
              </div>

              {/* Quick stats row */}
              <div className="flex items-center gap-6 text-sm">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> {completeSections}/{totalSections} complete
                </span>
                {partialSections > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> {partialSections} partial
                  </span>
                )}
                {missingSections > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <XCircle className="h-4 w-4" /> {missingSections} missing
                  </span>
                )}
              </div>
            </div>

            {/* Section cards grid */}
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">Section Breakdown</h2>              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.sections.map((section) => (
                  <SectionCard key={section.name} section={section} reportId={result.reportId} />
                ))}
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button variant="outline" onClick={runCheck} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Run Again
              </Button>
              <Link href={`/dashboard/reports/${reportId}`}>
                <Button>
                  <FileText className="mr-2 h-4 w-4" />
                  Back to Report
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}