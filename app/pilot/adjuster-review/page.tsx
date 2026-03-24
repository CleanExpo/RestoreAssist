"use client"

/**
 * Adjuster Review Time Form — CLAIM-004
 *
 * Public page shared with insurance adjuster teams during the Phase 2 pilot.
 * No login required. Access is controlled by the pilot token embedded in the URL
 * (shared by the RestoreAssist pilot team with each participating insurer).
 *
 * Usage: https://app.restoreassist.com.au/pilot/adjuster-review?token=nir-pilot-2026
 *
 * Records: how long an adjuster spent reviewing a report (NIR vs. existing format).
 * Feeds: CLAIM-004 in the NIR evidence register via /api/pilot/adjuster-session.
 */

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Clock, ChevronRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type FormState = "idle" | "submitting" | "done" | "error" | "invalid-token"

const FORMAT_OPTIONS = [
  {
    value: "nir",
    label: "NIR Format",
    description: "National Inspection Report — the standardised format you were asked to review",
  },
  {
    value: "existing",
    label: "Existing Format",
    description: "Your company's current non-standardised restoration report format",
  },
]

function AdjusterReviewContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [reportFormat, setReportFormat] = useState<"nir" | "existing" | "">("")
  const [hours, setHours]               = useState("")
  const [minutes, setMinutes]           = useState("")
  const [reportId, setReportId]         = useState("")
  const [adjusterCode, setAdjusterCode] = useState("")
  const [notes, setNotes]               = useState("")
  const [formState, setFormState]       = useState<FormState>("idle")
  const [errors, setErrors]             = useState<string[]>([])

  // Validate token on mount (just check it's non-empty — actual validation is server-side)
  useEffect(() => {
    if (!token) setFormState("invalid-token")
  }, [token])

  const totalMinutes = () => {
    const h = parseInt(hours || "0", 10)
    const m = parseInt(minutes || "0", 10)
    return h * 60 + m
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (!reportFormat) errs.push("Please select the report format you reviewed.")
    const total = totalMinutes()
    if (total <= 0) errs.push("Please enter the time you spent reviewing the report.")
    if (total > 480) errs.push("Review time cannot exceed 8 hours.")
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setFormState("submitting")

    try {
      const res = await fetch("/api/pilot/adjuster-session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pilotToken:    token,
          reportFormat,
          reviewMinutes: totalMinutes(),
          reportId:      reportId.trim() || undefined,
          adjusterCode:  adjusterCode.trim() || undefined,
          notes:         notes.trim() || undefined,
        }),
      })

      if (res.status === 403) {
        setFormState("invalid-token")
        return
      }

      if (!res.ok) {
        setFormState("error")
        return
      }

      setFormState("done")

    } catch {
      setFormState("error")
    }
  }

  // ── Invalid token ───────────────────────────────────────────────────────────
  if (formState === "invalid-token") {
    return (
      <PageShell>
        <div className="text-center space-y-3">
          <AlertTriangle className="mx-auto text-amber-500" size={40} />
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-slate-200">
            Invalid or missing pilot token
          </h2>
          <p className="text-sm text-neutral-500 dark:text-slate-400 max-w-sm mx-auto">
            This page requires a valid pilot token in the URL. Contact your
            RestoreAssist pilot coordinator for the correct link.
          </p>
        </div>
      </PageShell>
    )
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  if (formState === "done") {
    return (
      <PageShell>
        <div className="text-center space-y-3">
          <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-slate-200">
            Thank you!
          </h2>
          <p className="text-sm text-neutral-600 dark:text-slate-400 max-w-sm mx-auto">
            Your review time has been recorded as part of the NIR Phase 2 pilot.
            This data directly contributes to validating the national inspection standard.
          </p>
          <button
            onClick={() => {
              setFormState("idle")
              setReportFormat("")
              setHours("")
              setMinutes("")
              setReportId("")
              setNotes("")
            }}
            className="mt-4 text-xs text-cyan-500 hover:text-cyan-600 underline underline-offset-2"
          >
            Submit another review
          </button>
        </div>
      </PageShell>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="space-y-1 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
            NIR Pilot Program
          </span>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-slate-100">
          Adjuster Report Review Time
        </h1>
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          Please record how long it took you to review the restoration report you
          were asked to assess. This takes about 60 seconds.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Report format selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-slate-300">
            Which report format did you review? <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReportFormat(opt.value as "nir" | "existing")}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition-all",
                  reportFormat === opt.value
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30"
                    : "border-neutral-200 dark:border-slate-700 hover:border-neutral-300 dark:hover:border-slate-600"
                )}
              >
                <div className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
                  {opt.label}
                </div>
                <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Time spent */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-slate-300 flex items-center gap-1.5">
            <Clock size={14} className="text-neutral-400" />
            Time spent reviewing the report <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="8"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="0"
                className="w-16 text-center text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-2 py-2 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
              <span className="text-xs text-neutral-500">hrs</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={e => setMinutes(e.target.value)}
                placeholder="0"
                className="w-16 text-center text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-2 py-2 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
              <span className="text-xs text-neutral-500">min</span>
            </div>
            {totalMinutes() > 0 && (
              <span className="text-xs text-neutral-400">
                = {totalMinutes()} minutes total
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 dark:text-slate-500">
            Include time spent: reading, querying data, writing notes, and verifying information.
          </p>
        </div>

        {/* Optional fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-slate-400">
              Report / Claim ID <span className="text-neutral-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reportId}
              onChange={e => setReportId(e.target.value)}
              placeholder="e.g. NIR-2026-001234"
              className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-slate-400">
              Your adjuster code <span className="text-neutral-400">(optional — anonymised)</span>
            </label>
            <input
              type="text"
              value={adjusterCode}
              onChange={e => setAdjusterCode(e.target.value)}
              placeholder="e.g. ADJ-03"
              className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-600 dark:text-slate-400">
            Notes <span className="text-neutral-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any observations about the report format, missing information, or what made the review faster or slower?"
            rows={3}
            className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2.5 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-none"
          />
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-4 py-3 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
            ))}
          </div>
        )}

        {formState === "error" && (
          <p className="text-xs text-red-500">
            Something went wrong. Please try again or contact the pilot coordinator.
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={formState === "submitting"}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          {formState === "submitting" ? (
            <><Loader2 size={16} className="animate-spin" /> Recording…</>
          ) : (
            <>Submit review time <ChevronRight size={16} /></>
          )}
        </button>

        <p className="text-xs text-center text-neutral-400 dark:text-slate-500">
          Your responses are anonymous and used only for NIR pilot validation.
          Data is governed by the RestoreAssist Privacy Policy.
        </p>

      </form>
    </PageShell>
  )
}

// ── Page export — Suspense boundary required for useSearchParams() ─────────────

export default function AdjusterReviewPage() {
  return (
    <Suspense fallback={<PageShell><div className="h-40" /></PageShell>}>
      <AdjusterReviewContent />
    </Suspense>
  )
}

// ── Layout wrapper ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-950 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-slate-800 p-8">
        {/* RestoreAssist wordmark */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-7 h-7 rounded-md bg-cyan-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">R</span>
          </div>
          <span className="text-sm font-semibold text-neutral-700 dark:text-slate-300">
            RestoreAssist
          </span>
          <span className="ml-auto text-xs text-neutral-400 dark:text-slate-500 border border-neutral-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
            Pilot Program
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
