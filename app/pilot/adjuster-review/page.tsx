"use client";

/**
 * Adjuster Review — CLAIM-004 + RA-1131
 *
 * Two modes controlled by URL params:
 *   1. ?token=<pilot-token>  — NIR pilot time-recording form (CLAIM-004 survey)
 *   2. ?inspectionId=<id>    — RA-1131 AI adjuster analysis (authenticated users)
 *
 * Public page shared with insurance adjuster teams during the Phase 2 pilot.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AdjusterRecommendation } from "@/lib/ai/adjuster-agent";

// ── Types ────────────────────────────────────────────────────────────────────

type FormState = "idle" | "submitting" | "done" | "error" | "invalid-token";

const FORMAT_OPTIONS = [
  {
    value: "nir",
    label: "NIR Format",
    description:
      "National Inspection Report — the standardised format you were asked to review",
  },
  {
    value: "existing",
    label: "Existing Format",
    description:
      "Your company's current non-standardised restoration report format",
  },
];

// ── Recommendation report component (RA-1131) ─────────────────────────────────

function RecommendationReport({ data }: { data: AdjusterRecommendation }) {
  const recommendationConfig = {
    approve: {
      label: "Approve",
      variant: "default" as const,
      color: "text-emerald-700 dark:text-emerald-400",
    },
    "query-contractor": {
      label: "Query Contractor",
      variant: "secondary" as const,
      color: "text-amber-700 dark:text-amber-400",
    },
    escalate: {
      label: "Escalate",
      variant: "destructive" as const,
      color: "text-red-700 dark:text-red-400",
    },
  };

  const costConfig = {
    "within-range": { label: "Within Range", variant: "default" as const },
    high: { label: "High", variant: "destructive" as const },
    low: { label: "Low", variant: "secondary" as const },
  };

  const severityVariant = {
    info: "secondary" as const,
    warning: "secondary" as const,
    critical: "destructive" as const,
  };

  const clauseVariant = {
    compliant: "default" as const,
    "non-compliant": "destructive" as const,
    "not-applicable": "secondary" as const,
  };

  const cfg = recommendationConfig[data.recommendation];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
            AI Adjuster Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <span className={cn("text-2xl font-bold", cfg.color)}>
              {cfg.label}
            </span>
            <Badge variant={cfg.variant}>{data.recommendation}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-slate-400">
            <span>Cost reasonableness:</span>
            <Badge variant={costConfig[data.costReasonableness].variant}>
              {costConfig[data.costReasonableness].label}
            </Badge>
          </div>
          <p className="text-xs text-neutral-400 dark:text-slate-500">
            Generated {new Date(data.generatedAt).toLocaleString("en-AU")} ·
            Inspection {data.inspectionId}
          </p>
        </CardContent>
      </Card>

      {/* Findings */}
      {data.findings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge
                    variant={severityVariant[f.severity]}
                    className="shrink-0 mt-0.5"
                  >
                    {f.severity}
                  </Badge>
                  <span className="text-neutral-700 dark:text-slate-300">
                    <span className="font-mono text-xs text-neutral-400 dark:text-slate-500 mr-1">
                      [{f.code}]
                    </span>
                    {f.description}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Clause compliance */}
      {data.clauseCompliance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Clause Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.clauseCompliance.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge
                    variant={clauseVariant[c.status]}
                    className="shrink-0 mt-0.5"
                  >
                    {c.status}
                  </Badge>
                  <span className="text-neutral-700 dark:text-slate-300">
                    <span className="font-medium">{c.citation}</span>
                    {c.note && (
                      <span className="text-neutral-500 dark:text-slate-400 ml-1">
                        — {c.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Anomalies */}
      {data.anomalies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Anomalies</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {data.anomalies.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-neutral-700 dark:text-slate-300"
                >
                  <AlertTriangle
                    size={14}
                    className="shrink-0 mt-0.5 text-amber-500"
                    aria-hidden="true"
                  />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Suggested questions */}
      {data.suggestedQuestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Suggested Questions for Contractor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5 list-decimal list-inside">
              {data.suggestedQuestions.map((q, i) => (
                <li
                  key={i}
                  className="text-sm text-neutral-700 dark:text-slate-300"
                >
                  {q}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── AI analysis panel (RA-1131) ───────────────────────────────────────────────

function AdjusterAnalysisPanel({ inspectionId }: { inspectionId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<AdjusterRecommendation | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const run = async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/pilot/adjuster-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      if (res.status === 401) {
        setErrorMsg("You must be signed in to run an analysis.");
        setState("error");
        return;
      }
      if (res.status === 402) {
        setErrorMsg("Active subscription or credits required.");
        setState("error");
        return;
      }
      if (!res.ok) {
        setErrorMsg("Analysis failed. Please try again.");
        setState("error");
        return;
      }
      const json = await res.json();
      setResult(json.data as AdjusterRecommendation);
      setState("done");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  };

  return (
    <PageShell>
      <div className="space-y-1 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#D4A574]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
            RA-1131 · AI Adjuster Review
          </span>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-slate-100">
          Claim Analysis
        </h1>
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          Inspection <span className="font-mono">{inspectionId}</span>
        </p>
      </div>

      {state === "idle" && (
        <button
          onClick={run}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white text-sm font-medium transition-colors"
          style={{ backgroundColor: "#1C2E47" }}
        >
          Run AI Analysis <ChevronRight size={16} />
        </button>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-neutral-500 dark:text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Analysing claim…</span>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-4 py-3 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
          <button
            onClick={() => setState("idle")}
            className="text-xs text-red-500 underline"
          >
            Try again
          </button>
        </div>
      )}

      {state === "done" && result && <RecommendationReport data={result} />}
    </PageShell>
  );
}

// ── Pilot survey form (CLAIM-004) ─────────────────────────────────────────────

function AdjusterReviewContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const inspectionId = searchParams.get("inspectionId") ?? "";

  // RA-1131: If inspectionId param present, show AI analysis panel instead of survey
  if (inspectionId) {
    return <AdjusterAnalysisPanel inspectionId={inspectionId} />;
  }

  const [reportFormat, setReportFormat] = useState<"nir" | "existing" | "">("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [reportId, setReportId] = useState("");
  const [adjusterCode, setAdjusterCode] = useState("");
  const [notes, setNotes] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errors, setErrors] = useState<string[]>([]);

  // Validate token on mount (just check it's non-empty — actual validation is server-side)
  useEffect(() => {
    if (!token) setFormState("invalid-token");
  }, [token]);

  const totalMinutes = () => {
    const h = parseInt(hours || "0", 10);
    const m = parseInt(minutes || "0", 10);
    return h * 60 + m;
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!reportFormat)
      errs.push("Please select the report format you reviewed.");
    const total = totalMinutes();
    if (total <= 0)
      errs.push("Please enter the time you spent reviewing the report.");
    if (total > 480) errs.push("Review time cannot exceed 8 hours.");
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setFormState("submitting");

    try {
      const res = await fetch("/api/pilot/adjuster-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pilotToken: token,
          reportFormat,
          reviewMinutes: totalMinutes(),
          reportId: reportId.trim() || undefined,
          adjusterCode: adjusterCode.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.status === 403) {
        setFormState("invalid-token");
        return;
      }

      if (!res.ok) {
        setFormState("error");
        return;
      }

      setFormState("done");
    } catch {
      setFormState("error");
    }
  };

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
    );
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
            This data directly contributes to validating the national inspection
            standard.
          </p>
          <button
            onClick={() => {
              setFormState("idle");
              setReportFormat("");
              setHours("");
              setMinutes("");
              setReportId("");
              setNotes("");
            }}
            className="mt-4 text-xs text-cyan-500 hover:text-cyan-600 underline underline-offset-2"
          >
            Submit another review
          </button>
        </div>
      </PageShell>
    );
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
          Please record how long it took you to review the restoration report
          you were asked to assess. This takes about 60 seconds.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Report format selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-slate-300">
            Which report format did you review?{" "}
            <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReportFormat(opt.value as "nir" | "existing")}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition-all",
                  reportFormat === opt.value
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30"
                    : "border-neutral-200 dark:border-slate-700 hover:border-neutral-300 dark:hover:border-slate-600",
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
            Time spent reviewing the report{" "}
            <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="8"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
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
                onChange={(e) => setMinutes(e.target.value)}
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
            Include time spent: reading, querying data, writing notes, and
            verifying information.
          </p>
        </div>

        {/* Optional fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-slate-400">
              Report / Claim ID{" "}
              <span className="text-neutral-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reportId}
              onChange={(e) => setReportId(e.target.value)}
              placeholder="e.g. NIR-2026-001234"
              className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-slate-400">
              Your adjuster code{" "}
              <span className="text-neutral-400">(optional — anonymised)</span>
            </label>
            <input
              type="text"
              value={adjusterCode}
              onChange={(e) => setAdjusterCode(e.target.value)}
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
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any observations about the report format, missing information, or what made the review faster or slower?"
            rows={3}
            className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2.5 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-none"
          />
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-4 py-3 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400">
                {e}
              </p>
            ))}
          </div>
        )}

        {formState === "error" && (
          <p className="text-xs text-red-500">
            Something went wrong. Please try again or contact the pilot
            coordinator.
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={formState === "submitting"}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          {formState === "submitting" ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Recording…
            </>
          ) : (
            <>
              Submit review time <ChevronRight size={16} />
            </>
          )}
        </button>

        <p className="text-xs text-center text-neutral-400 dark:text-slate-500">
          Your responses are anonymous and used only for NIR pilot validation.
          Data is governed by the RestoreAssist Privacy Policy.
        </p>
      </form>
    </PageShell>
  );
}

// ── Page export — Suspense boundary required for useSearchParams() ─────────────

export default function AdjusterReviewPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="h-40" />
        </PageShell>
      }
    >
      <AdjusterReviewContent />
    </Suspense>
  );
}

// ── Layout wrapper ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-950 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-slate-800 p-8">
        {/* RestoreAssist wordmark */}
        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ backgroundColor: "#1C2E47" }}
          >
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
  );
}
