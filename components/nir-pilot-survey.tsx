"use client"

/**
 * NIR Pilot Survey — CLAIM-005: Technician Ease-of-Use
 *
 * Shown once per technician after an inspection reaches COMPLETED status.
 * Submits a 1–5 rating to /api/pilot/observations as a CLAIM-005 observation.
 *
 * Display logic:
 *   - Only renders when inspection.status === 'COMPLETED'
 *   - Checks /api/pilot/survey-status on mount; hides if already responded
 *   - Dismissible (dismissed = not rated; recorded so we don't ask again)
 *   - Once submitted, shows a thank-you state and disappears after 4 s
 */

import { useState, useEffect, useCallback } from "react"
import { Star, X, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface NirPilotSurveyProps {
  inspectionId: string
  inspectionStatus: string
}

type SurveyState = "checking" | "hidden" | "visible" | "submitting" | "done"

const RATING_LABELS: Record<number, string> = {
  1: "Very difficult",
  2: "Somewhat difficult",
  3: "Neutral",
  4: "Easy to use",
  5: "Very easy to use",
}

export function NirPilotSurvey({ inspectionId, inspectionStatus }: NirPilotSurveyProps) {
  const [state, setState]     = useState<SurveyState>("checking")
  const [rating, setRating]   = useState<number>(0)
  const [hovered, setHovered] = useState<number>(0)
  const [notes, setNotes]     = useState("")
  const [error, setError]     = useState<string | null>(null)

  // Only show for completed inspections
  const isCompleted = inspectionStatus === "COMPLETED"

  const checkSurveyStatus = useCallback(async () => {
    if (!isCompleted) { setState("hidden"); return }
    try {
      const res = await fetch("/api/pilot/survey-status")
      if (!res.ok) { setState("hidden"); return }
      const data = await res.json() as { hasResponded: boolean }
      setState(data.hasResponded ? "hidden" : "visible")
    } catch {
      setState("hidden")
    }
  }, [isCompleted])

  useEffect(() => {
    checkSurveyStatus()
  }, [checkSurveyStatus])

  const handleDismiss = async () => {
    // Record a dismissal so we don't ask again — value 0 = dismissed
    setState("hidden")
    try {
      await fetch("/api/pilot/observations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId:        "CLAIM-005",
          observationType: "technician_survey",
          value:          0,
          group:          "nir",
          inspectionId,
          notes:          "Dismissed without rating",
        }),
      })
    } catch {
      // Silent — dismissal recording failure shouldn't surface to the user
    }
  }

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a rating before submitting."); return }
    setError(null)
    setState("submitting")

    try {
      const res = await fetch("/api/pilot/observations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId:         "CLAIM-005",
          observationType: "technician_survey",
          value:           rating,
          group:           "nir",
          inspectionId,
          notes:           notes.trim() || undefined,
        }),
      })

      if (!res.ok) {
        setState("visible")
        setError("Could not save your response. Please try again.")
        return
      }

      setState("done")
      // Auto-dismiss after 4 s
      setTimeout(() => setState("hidden"), 4000)

    } catch {
      setState("visible")
      setError("Network error. Please try again.")
    }
  }

  if (state === "checking" || state === "hidden") return null

  // ── Thank-you state ─────────────────────────────────────────────────────────
  if (state === "done") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
          <Star className="text-emerald-500" size={16} fill="currentColor" />
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            Thank you — your feedback helps validate the NIR standard.
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
            Rating recorded as part of the Phase 2 pilot.
          </p>
        </div>
      </div>
    )
  }

  // ── Survey card ─────────────────────────────────────────────────────────────
  return (
    <div className="mt-6 rounded-xl border border-cyan-200/60 dark:border-cyan-800/40 bg-white dark:bg-slate-900/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
            NIR Pilot — Quick Feedback
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-slate-300 transition-colors"
          aria-label="Dismiss survey"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
            How easy was this inspection form to use in the field?
          </p>
          <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
            Your rating contributes to CLAIM-005 in the NIR evidence register.
          </p>
        </div>

        {/* Star rating */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => { setRating(n); setError(null) }}
              className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
              aria-label={`Rate ${n} — ${RATING_LABELS[n]}`}
            >
              <Star
                size={28}
                className={cn(
                  "transition-colors",
                  (hovered > 0 ? n <= hovered : n <= rating)
                    ? "text-amber-400 fill-amber-400"
                    : "text-neutral-300 dark:text-slate-600"
                )}
              />
            </button>
          ))}
          {(hovered > 0 || rating > 0) && (
            <span className="ml-2 text-xs text-neutral-500 dark:text-slate-400">
              {RATING_LABELS[hovered || rating]}
            </span>
          )}
        </div>

        {/* Optional notes — only shown after rating selected */}
        {rating > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500 dark:text-slate-400">
              Any comments? <span className="text-neutral-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What worked well, or what was difficult?"
              rows={2}
              className="w-full text-xs rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-none"
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-neutral-100 dark:border-slate-800 flex items-center justify-between">
        <button
          onClick={handleDismiss}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-slate-300 transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={handleSubmit}
          disabled={state === "submitting" || rating === 0}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-lg transition-all",
            rating > 0
              ? "bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm"
              : "bg-neutral-100 dark:bg-slate-800 text-neutral-400 cursor-not-allowed"
          )}
        >
          {state === "submitting" ? (
            <><Loader2 size={12} className="animate-spin" /> Saving…</>
          ) : (
            <>Submit rating <ChevronRight size={12} /></>
          )}
        </button>
      </div>
    </div>
  )
}
