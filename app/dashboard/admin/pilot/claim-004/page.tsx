"use client"

/**
 * CLAIM-004 Adjuster Review Time — Admin
 *
 * Route: /dashboard/admin/pilot/claim-004
 * Auth:  ADMIN role required
 *
 * CLAIM-004 measures how long insurance adjusters spend reviewing a report.
 * Success criteria: NIR mean review time < 45 minutes AND >30% reduction vs control.
 *
 * Data collection options:
 *   1. Self-report via the token-gated API endpoint at POST /api/pilot/adjuster-session
 *      (adjusters access this directly with the PILOT_ADJUSTER_TOKEN)
 *   2. Manual entry here — for sessions recorded via stopwatch during structured tests
 *
 * Both NIR and control (existing format) session times are recorded here.
 * Minimum: 60 NIR sessions + 60 control sessions (6 adjusters × 10 reports each).
 */

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Clock,
  Plus,
  Loader2,
  CheckCircle2,
  Trash2,
  Upload,
  Info,
  ExternalLink,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────────

type SessionGroup = "nir" | "control"

interface AdjusterEntry {
  adjusterCode: string
  group: SessionGroup
  reviewMinutes: string
  reportRef: string
  notes: string
}

type BatchLine = {
  adjusterCode?: string
  group: SessionGroup
  reviewMinutes: number
  reportRef?: string
  notes?: string
}

const BLANK_ENTRY: AdjusterEntry = {
  adjusterCode: "",
  group: "nir",
  reviewMinutes: "",
  reportRef: "",
  notes: "",
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Claim004AdjusterSessionPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [entries, setEntries]           = useState<AdjusterEntry[]>([{ ...BLANK_ENTRY }])
  const [batchJson, setBatchJson]       = useState("")
  const [batchMode, setBatchMode]       = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [errors, setErrors]             = useState<string[]>([])
  const [batchErrors, setBatchErrors]   = useState<string[]>([])
  const [successCount, setSuccessCount] = useState<number | null>(null)

  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (status === "loading") return null
  if (status === "unauthenticated") { router.push("/login"); return null }
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    router.push("/dashboard"); return null
  }

  // ── Entry manipulation ──────────────────────────────────────────────────────

  const updateEntry = (idx: number, field: keyof AdjusterEntry, value: string) =>
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))

  const addEntry = () => setEntries(prev => [...prev, { ...BLANK_ENTRY }])

  const removeEntry = (idx: number) =>
    setEntries(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  // ── Validation ───────────────────────────────────────────────────────────────

  const validateEntries = (toValidate: AdjusterEntry[]): string[] => {
    const errs: string[] = []
    toValidate.forEach((e, i) => {
      const mins = parseFloat(e.reviewMinutes)
      if (isNaN(mins) || mins <= 0) errs.push(`Row ${i + 1}: Review minutes must be a positive number.`)
      if (mins > 480) errs.push(`Row ${i + 1}: Review time seems too high (>8 hours). Please verify.`)
    })
    return errs
  }

  // ── Manual submit ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const errs = validateEntries(entries)
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)
    setSuccessCount(null)

    let succeeded = 0
    const failed: string[] = []

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      try {
        const res = await fetch("/api/pilot/observations", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claimId:         "CLAIM-004",
            observationType: "adjuster_session",
            value:           parseFloat(e.reviewMinutes),
            group:           e.group,
            context: {
              adjusterCode: e.adjusterCode || "anonymous",
              reportFormat: e.group === "nir" ? "nir" : "existing",
              source:       "admin-manual-entry",
            },
            notes: [
              e.reportRef ? `Report ref: ${e.reportRef}` : "",
              e.adjusterCode ? `Adjuster: ${e.adjusterCode}` : "",
              e.notes,
            ].filter(Boolean).join(" | ") || undefined,
          }),
        })
        if (res.ok) {
          succeeded++
        } else {
          const body = await res.json().catch(() => ({}))
          failed.push(`Row ${i + 1}: ${(body as { error?: string }).error ?? `HTTP ${res.status}`}`)
        }
      } catch {
        failed.push(`Row ${i + 1}: Network error`)
      }
    }

    setSubmitting(false)
    if (failed.length > 0) {
      setErrors(failed)
    } else {
      setSuccessCount(succeeded)
      setEntries([{ ...BLANK_ENTRY }])
    }
  }

  // ── Batch JSON submit ────────────────────────────────────────────────────────

  const handleBatchSubmit = async () => {
    setBatchErrors([])
    setSuccessCount(null)

    let parsed: BatchLine[]
    try {
      const raw = JSON.parse(batchJson) as unknown
      if (!Array.isArray(raw)) { setBatchErrors(["JSON must be an array of objects."]); return }
      parsed = raw as BatchLine[]
    } catch (e) {
      setBatchErrors([`Invalid JSON: ${String(e)}`]); return
    }

    const schemaErrors: string[] = []
    parsed.forEach((row, i) => {
      if (typeof row.reviewMinutes !== "number" || row.reviewMinutes <= 0)
        schemaErrors.push(`Item ${i}: reviewMinutes must be a positive number`)
      if (!["nir", "control"].includes(row.group))
        schemaErrors.push(`Item ${i}: group must be "nir" or "control"`)
    })
    if (schemaErrors.length > 0) { setBatchErrors(schemaErrors); return }

    setSubmitting(true)
    let succeeded = 0
    const failed: string[] = []

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]
      try {
        const res = await fetch("/api/pilot/observations", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claimId:         "CLAIM-004",
            observationType: "adjuster_session",
            value:           row.reviewMinutes,
            group:           row.group,
            context: {
              adjusterCode: row.adjusterCode ?? "anonymous",
              reportFormat: row.group === "nir" ? "nir" : "existing",
              source:       "admin-batch-entry",
            },
            notes: row.reportRef
              ? `Report ref: ${row.reportRef}${row.notes ? ` | ${row.notes}` : ""}`
              : row.notes || undefined,
          }),
        })
        if (res.ok) succeeded++
        else {
          const body = await res.json().catch(() => ({}))
          failed.push(`Item ${i}: ${(body as { error?: string }).error ?? `HTTP ${res.status}`}`)
        }
      } catch {
        failed.push(`Item ${i}: Network error`)
      }
    }

    setSubmitting(false)
    if (failed.length > 0) { setBatchErrors(failed) }
    else { setSuccessCount(succeeded); setBatchJson("") }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/dashboard/admin/pilot")}
          className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 mb-4 transition-colors"
        >
          <ArrowLeft size={12} />
          Back to pilot dashboard
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
            <Clock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                CLAIM-004 Adjuster Session Entry
              </h1>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-neutral-500">
                Admin only
              </Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
              Record adjuster report review times (minutes) for NIR vs. existing formats.
            </p>
          </div>
        </div>
      </div>

      {/* Context card */}
      <div className="rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 bg-cyan-50/40 dark:bg-cyan-950/20 px-4 py-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-slate-300">
          <Info size={12} className="text-cyan-600 dark:text-cyan-400" />
          Two data collection methods
        </div>
        <p className="text-xs text-neutral-600 dark:text-slate-400 leading-relaxed">
          Adjuster sessions can be recorded two ways: (1) adjusters self-report via the
          token-gated API endpoint using their team&apos;s pilot token, or (2) use this form
          for sessions timed during structured test rounds. Record review time in{" "}
          <strong>decimal minutes</strong> (e.g. 42.5 for 42 min 30 sec). Use{" "}
          <strong>NIR group</strong> for RestoreAssist-generated reports,{" "}
          <strong>Control group</strong> for non-standardised formats. Minimum{" "}
          <strong>60 sessions per group</strong>.
        </p>
        <a
          href="/api/pilot/adjuster-session"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 font-medium"
        >
          View self-report API endpoint <ExternalLink size={11} />
        </a>
      </div>

      {/* Success banner */}
      {successCount !== null && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            <strong>{successCount}</strong> adjuster session{successCount !== 1 ? "s" : ""} recorded for CLAIM-004.
          </p>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setBatchMode(false); setErrors([]); setBatchErrors([]) }}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-lg transition-all",
            !batchMode
              ? "bg-neutral-900 dark:bg-slate-200 text-white dark:text-slate-900"
              : "text-neutral-600 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-800"
          )}
        >
          Manual entry
        </button>
        <button
          onClick={() => { setBatchMode(true); setErrors([]); setBatchErrors([]) }}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5",
            batchMode
              ? "bg-neutral-900 dark:bg-slate-200 text-white dark:text-slate-900"
              : "text-neutral-600 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-800"
          )}
        >
          <Upload size={11} />
          Batch JSON
        </button>
      </div>

      {/* ── Manual entry ──────────────────────────────────────────────────────── */}
      {!batchMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Enter adjuster sessions</CardTitle>
            <CardDescription className="text-xs">
              One row per review session. Adjuster code and report ref are optional (anonymised).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Column headers */}
            <div className="grid grid-cols-[90px_80px_110px_1fr_1fr_28px] gap-2 px-1">
              {["Adjuster code", "Group *", "Minutes *", "Report ref", "Notes", ""].map((h, i) => (
                <div key={i} className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {entries.map((entry, idx) => (
              <div key={idx} className="grid grid-cols-[90px_80px_110px_1fr_1fr_28px] gap-2 items-center">
                {/* Adjuster code */}
                <input
                  type="text"
                  value={entry.adjusterCode}
                  onChange={e => updateEntry(idx, "adjusterCode", e.target.value)}
                  placeholder="ADJ-03"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Group */}
                <select
                  value={entry.group}
                  onChange={e => updateEntry(idx, "group", e.target.value)}
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-2 py-2 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <option value="nir">NIR</option>
                  <option value="control">Control</option>
                </select>
                {/* Minutes */}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={entry.reviewMinutes}
                  onChange={e => updateEntry(idx, "reviewMinutes", e.target.value)}
                  placeholder="e.g. 42.5"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Report ref */}
                <input
                  type="text"
                  value={entry.reportRef}
                  onChange={e => updateEntry(idx, "reportRef", e.target.value)}
                  placeholder="Report ID or ref"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Notes */}
                <input
                  type="text"
                  value={entry.notes}
                  onChange={e => updateEntry(idx, "notes", e.target.value)}
                  placeholder="Optional notes"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Remove */}
                <button
                  onClick={() => removeEntry(idx)}
                  disabled={entries.length === 1}
                  className="w-7 h-7 rounded flex items-center justify-center text-neutral-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 disabled:opacity-30 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {/* Add row */}
            <button
              onClick={addEntry}
              className="flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 transition-colors font-medium"
            >
              <Plus size={13} />
              Add row
            </button>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2.5 space-y-1">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                ))}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-neutral-400 dark:text-slate-500">
                {entries.length} session{entries.length !== 1 ? "s" : ""} to submit
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {submitting ? (
                  <><Loader2 size={13} className="animate-spin mr-1.5" /> Recording…</>
                ) : (
                  <>Record {entries.length} session{entries.length !== 1 ? "s" : ""}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Batch JSON ────────────────────────────────────────────────────────── */}
      {batchMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bulk upload via JSON</CardTitle>
            <CardDescription className="text-xs">
              Paste an array of adjuster session records. Each needs <code className="font-mono">reviewMinutes</code> and <code className="font-mono">group</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-neutral-900 dark:bg-slate-950 p-4 overflow-x-auto">
              <pre className="text-[11px] text-slate-300 font-mono leading-relaxed whitespace-pre">{`[
  {
    "group": "nir",
    "reviewMinutes": 38.5,
    "adjusterCode": "ADJ-03",       // optional, anonymised
    "reportRef": "NIR-2026-00142",  // optional
    "notes": "IAG structured review round 2"  // optional
  },
  {
    "group": "control",
    "reviewMinutes": 67,
    "adjusterCode": "ADJ-03"
  }
]`}</pre>
            </div>

            <textarea
              value={batchJson}
              onChange={e => setBatchJson(e.target.value)}
              placeholder="Paste JSON array here..."
              rows={10}
              className="w-full font-mono text-xs rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2.5 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-y"
            />

            {batchErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2.5 space-y-1">
                {batchErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-400 dark:text-slate-500">
                Records submitted one-by-one to preserve partial success.
              </p>
              <Button
                onClick={handleBatchSubmit}
                disabled={submitting || !batchJson.trim()}
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {submitting ? (
                  <><Loader2 size={13} className="animate-spin mr-1.5" /> Uploading…</>
                ) : (
                  <><Upload size={13} className="mr-1.5" /> Submit batch</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data requirement summary */}
      <div className="rounded-lg border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-neutral-600 dark:text-slate-400">
          CLAIM-004 data requirements
        </p>
        <div className="grid grid-cols-2 gap-4 text-xs">
          {[
            { label: "NIR sessions", target: 60, colour: "bg-cyan-400", note: "NIR format reviewed by adjusters" },
            { label: "Control sessions", target: 60, colour: "bg-violet-400", note: "Existing format reviewed by adjusters" },
          ].map(({ label, target, colour, note }) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-neutral-500 dark:text-slate-400">
                <span>{label}</span>
                <span className="font-mono">? / {target}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full w-0", colour)} />
              </div>
              <p className="text-[10px] text-neutral-400 dark:text-slate-500">{note}. Check the{" "}
                <a href="/dashboard/admin/pilot" className="text-cyan-500 hover:underline">
                  readiness dashboard
                </a>{" "}
                for live counts.
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-neutral-400 dark:text-slate-500 pt-1 border-t border-neutral-100 dark:border-slate-800">
          Structured test protocol: 6 adjusters × 10 NIR reports + 10 existing format reports each.
          Adjuster codes are anonymised — use ADJ-01 through ADJ-06 or similar.
        </p>
      </div>

    </div>
  )
}
