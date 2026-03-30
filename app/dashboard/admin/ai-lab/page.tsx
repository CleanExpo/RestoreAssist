"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Sparkles,
  PlayCircle,
  BarChart2,
  TrendingUp,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ClaimType = "water_damage" | "fire_smoke" | "storm" | "mould" | "contents"

interface SubScores {
  structural: number
  citation: number
  equipment: number
  specificity: number
  category: number
}

interface EvaluationCaseResult {
  testCaseId: string
  claimType: string
  compositeScore: number
  subScores: SubScores
  durationMs: number
}

interface EvaluationReport {
  totalCases: number
  meanComposite: number
  minComposite: number
  maxComposite: number
  stdDev: number
  meanByClaimType: Record<string, number>
  cases: EvaluationCaseResult[]
  ranAt: string
}

interface OptimizationResult {
  claimType: string
  iterationsRun: number
  bestScoreAchieved: number
  baselineScore: number
  improvement: number
  promoted: boolean
  promptVariantId: string | null
  estimatedCostAud: number
}

const CLAIM_TYPES: { value: ClaimType; label: string }[] = [
  { value: "water_damage", label: "Water Damage" },
  { value: "fire_smoke", label: "Fire & Smoke" },
  { value: "storm", label: "Storm Damage" },
  { value: "mould", label: "Mould Remediation" },
  { value: "contents", label: "Contents" },
]

function ScoreBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const pct = Math.round(score)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-neutral-500 dark:text-slate-400">{label} <span className="text-neutral-400">({weight}%)</span></span>
        <span className={cn("font-semibold", pct >= 80 ? "text-emerald-500" : pct >= 60 ? "text-amber-500" : "text-red-500")}>
          {pct}
        </span>
      </div>
      <div className="w-full bg-neutral-100 dark:bg-slate-700 rounded-full h-1.5">
        <div
          className={cn("h-1.5 rounded-full transition-all", pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function CaseCard({ c }: { c: EvaluationCaseResult }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
      <button
        className="w-full flex items-center justify-between p-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
            c.compositeScore >= 80 ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              : c.compositeScore >= 60 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {Math.round(c.compositeScore)}
          </div>
          <div>
            <div className="text-sm font-medium text-neutral-900 dark:text-white">{c.testCaseId}</div>
            <div className="text-xs text-neutral-400">{c.claimType} · {c.durationMs}ms</div>
          </div>
        </div>
        {open ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-100 dark:border-slate-700/50 pt-2">
          <ScoreBar label="Structural completeness" score={c.subScores.structural} weight={30} />
          <ScoreBar label="IICRC citation density" score={c.subScores.citation} weight={25} />
          <ScoreBar label="Equipment ratio" score={c.subScores.equipment} weight={20} />
          <ScoreBar label="Specificity" score={c.subScores.specificity} weight={15} />
          <ScoreBar label="Category compliance" score={c.subScores.category} weight={10} />
        </div>
      )}
    </div>
  )
}

export default function AILabPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [evalClaimType, setEvalClaimType] = useState<ClaimType | "all">("all")
  const [evalSampleSize, setEvalSampleSize] = useState(5)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evalReport, setEvalReport] = useState<EvaluationReport | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  const [optClaimType, setOptClaimType] = useState<ClaimType>("water_damage")
  const [optBudget, setOptBudget] = useState(15)
  const [optThreshold, setOptThreshold] = useState(2)
  const [isOptimising, setIsOptimising] = useState(false)
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null)
  const [optError, setOptError] = useState<string | null>(null)

  if (status === "loading") return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-cyan-500" size={28} /></div>
  if (!session) { router.push("/login"); return null }

  const runEvaluation = async () => {
    setIsEvaluating(true)
    setEvalReport(null)
    setEvalError(null)
    try {
      const body: Record<string, unknown> = { sampleSize: evalSampleSize }
      if (evalClaimType !== "all") body.claimTypes = [evalClaimType]

      const resp = await fetch("/api/admin/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_KEY ?? "admin" },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? "Evaluation failed")
      setEvalReport(data.report)
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsEvaluating(false)
    }
  }

  const runOptimisation = async () => {
    setIsOptimising(true)
    setOptResult(null)
    setOptError(null)
    try {
      const resp = await fetch("/api/admin/optimize-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimType: optClaimType, budget: optBudget, threshold: optThreshold }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? "Optimisation failed")
      setOptResult(data.result)
    } catch (err) {
      setOptError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsOptimising(false)
    }
  }

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/dashboard/admin")} className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Sparkles size={20} className="text-cyan-500" />
            AI Lab
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
            Autoresearch-inspired prompt quality evaluation and optimisation
          </p>
        </div>
      </div>

      {/* Evaluation Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 size={16} className="text-cyan-500" />
            Scope Quality Evaluation
          </CardTitle>
          <CardDescription>
            Scores generated scopes against 5 quality dimensions using deterministic analysis. No API cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 block mb-1.5">Claim Type</label>
              <select
                value={evalClaimType}
                onChange={(e) => setEvalClaimType(e.target.value as ClaimType | "all")}
                className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All claim types</option>
                {CLAIM_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
              </select>
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 block mb-1.5">Sample Size</label>
              <input
                type="number"
                min={1}
                max={10}
                value={evalSampleSize}
                onChange={(e) => setEvalSampleSize(Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runEvaluation} disabled={isEvaluating} className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white">
                {isEvaluating ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                {isEvaluating ? "Running…" : "Run Evaluation"}
              </Button>
            </div>
          </div>

          {evalError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800/40">
              <XCircle size={14} /> {evalError}
            </div>
          )}

          {evalReport && (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Mean Score", value: Math.round(evalReport.meanComposite), suffix: "/100" },
                  { label: "Min Score", value: Math.round(evalReport.minComposite), suffix: "" },
                  { label: "Max Score", value: Math.round(evalReport.maxComposite), suffix: "" },
                  { label: "Cases", value: evalReport.totalCases, suffix: "" },
                ].map((s) => (
                  <div key={s.label} className="text-center p-3 rounded-lg bg-neutral-50 dark:bg-slate-800/50 border border-neutral-100 dark:border-slate-700/50">
                    <div className="text-xl font-bold text-neutral-900 dark:text-white">{s.value}<span className="text-sm font-normal text-neutral-400">{s.suffix}</span></div>
                    <div className="text-xs text-neutral-400 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-claim-type breakdown */}
              {Object.keys(evalReport.meanByClaimType).length > 1 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">By claim type</div>
                  {Object.entries(evalReport.meanByClaimType).map(([ct, score]) => (
                    <div key={ct} className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500 w-28 capitalize">{ct.replace("_", " ")}</span>
                      <div className="flex-1 bg-neutral-100 dark:bg-slate-700 rounded-full h-2">
                        <div className={cn("h-2 rounded-full", score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${score}%` }} />
                      </div>
                      <span className="text-xs font-medium w-6">{Math.round(score)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Case-by-case results */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">Case results</div>
                {evalReport.cases.map((c) => <CaseCard key={c.testCaseId} c={c} />)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Optimisation Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp size={16} className="text-purple-500" />
            Prompt Optimisation
          </CardTitle>
          <CardDescription>
            Autonomous prompt improvement loop — Claude edits prompts, scores variants, promotes the best. ~$0.02 per API call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 block mb-1.5">Claim Type</label>
              <select
                value={optClaimType}
                onChange={(e) => setOptClaimType(e.target.value as ClaimType)}
                className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {CLAIM_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 block mb-1.5">Budget (calls)</label>
              <input
                type="number"
                min={5}
                max={100}
                value={optBudget}
                onChange={(e) => setOptBudget(Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 block mb-1.5">Min improvement</label>
              <input
                type="number"
                min={1}
                max={20}
                value={optThreshold}
                onChange={(e) => setOptThreshold(Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runOptimisation} disabled={isOptimising} className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white">
                {isOptimising ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {isOptimising ? "Optimising…" : "Optimise"}
              </Button>
            </div>
          </div>

          <div className="text-xs text-neutral-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-lg p-2.5">
            Estimated cost: ~${(optBudget * 0.02).toFixed(2)} AUD · Budget {optBudget} calls · Threshold +{optThreshold} points required to promote
          </div>

          {optError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800/40">
              <XCircle size={14} /> {optError}
            </div>
          )}

          {optResult && (
            <div className="rounded-lg border border-neutral-200 dark:border-slate-700/50 bg-neutral-50 dark:bg-slate-800/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                {optResult.promoted ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <XCircle size={16} className="text-amber-500" />
                )}
                <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                  {optResult.promoted ? "New variant promoted to production" : "No improvement found — baseline retained"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold">{Math.round(optResult.baselineScore)}</div>
                  <div className="text-xs text-neutral-400">Baseline</div>
                </div>
                <div>
                  <div className={cn("text-lg font-bold", optResult.improvement > 0 ? "text-emerald-500" : "text-neutral-400")}>
                    {optResult.improvement > 0 ? "+" : ""}{Math.round(optResult.improvement)}
                  </div>
                  <div className="text-xs text-neutral-400">Improvement</div>
                </div>
                <div>
                  <div className="text-lg font-bold">${optResult.estimatedCostAud.toFixed(2)}</div>
                  <div className="text-xs text-neutral-400">Cost AUD</div>
                </div>
              </div>
              <div className="text-xs text-neutral-400">
                {optResult.iterationsRun} iterations · {optResult.claimType.replace("_", " ")}
                {optResult.promptVariantId && ` · Variant ID: ${optResult.promptVariantId.slice(0, 8)}…`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
