"use client";

/**
 * Live Teacher — Gate Metrics (ANALYSIS layer). Admin.
 *
 * Route: /dashboard/admin/live-teacher
 * Auth:  ADMIN role required (client-side redirect + server-side API gate)
 *
 * Surfaces the three go-live gates for the AI Live Teacher pilot:
 *   1. Cost per inspection     (GET .cost)
 *   2. Citation-error rate     (GET .citations)
 *   3. Completeness delta      (GET .completeness)
 * from GET /api/admin/live-teacher/gate-metrics. Auto-refreshes every 5 minutes.
 *
 * Gate pass thresholds below are the founder-tunable pilot defaults.
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { evaluateCompletenessGate } from "@/lib/live-teacher/gate-metrics";

// ── Gate pass thresholds (pilot defaults — tune in review) ──────────────────
const COST_GATE_P95_CENTS = 500; // 95th-pct inspection cost ≤ $5 AUD
const CITATION_GATE_MAX_RATE = 0.02; // ≤ 2% fabricated-clause refs
const COHORT_MIN_SESSIONS = 20; // sessions before a GO decision is meaningful
// Completeness gate needs statistical validity, not just deltaPoints > 0:
const COMPLETENESS_MIN_PER_ARM = 5; // ≥5 reports in EACH arm before the delta means anything
const COMPLETENESS_MIN_DELTA_POINTS = 15; // ≥15pt uplift (0-100 scale) to count as a real effect

// ── Response types (mirror the gate-metrics route) ──────────────────────────
interface CostRollup {
  inspectionsMeasured: number;
  meanCostCents: number;
  p95CostCents: number;
  overThresholdCount: number;
  overThresholdPct: number;
}
interface CitationMetrics {
  totalRefs: number;
  totalAssistantUtterances: number;
  verdictCounts: {
    valid: number;
    invalid_no_such_clause: number;
    unknown: number;
    edition_mismatch: number;
    unparseable: number;
  };
  validatableRefs: number;
  unknownCount: number;
  citationErrorRate: number;
  utterancesWithInvalidRefPct: number;
}
interface CompletenessDelta {
  nAssisted: number;
  nControl: number;
  meanAssisted: number | null;
  meanControl: number | null;
  deltaPoints: number | null;
  sufficient: boolean;
}
interface GateMetrics {
  cost: CostRollup;
  citations: CitationMetrics;
  completeness: CompletenessDelta;
  cohort: { sessions: number; inspectionsMeasured: number; openSessions: number };
  meta: { from: string; to: string; organizationId: string | null; notes: string[] };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function aud(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ProgressBar({
  value,
  max,
  colour,
}: {
  value: number;
  max: number;
  colour: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-neutral-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", colour)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="rounded-xl border px-4 py-3 space-y-0.5 border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="text-xs text-neutral-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-slate-100">
        {value}
      </div>
      <div className="text-xs text-neutral-400 dark:text-slate-500">{sub}</div>
    </div>
  );
}

function GateCard({
  title,
  pass,
  collecting,
  headline,
  sub,
  children,
}: {
  title: string;
  pass: boolean;
  collecting: boolean;
  headline: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "border transition-all",
        collecting
          ? "border-neutral-200 dark:border-slate-800"
          : pass
            ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20"
            : "border-amber-200 dark:border-amber-800/60 bg-amber-50/30 dark:bg-amber-950/20",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
            {title}
          </CardTitle>
          {collecting ? (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 text-neutral-500 dark:text-slate-400"
            >
              Collecting data
            </Badge>
          ) : pass ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] py-0 px-1.5 border-0">
              Pass
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
            >
              Below gate
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-slate-100">
            {headline}
          </div>
          <div className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
            {sub}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LiveTeacherGateMetricsDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<GateMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if ((session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
  }, [status, session, router]);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/live-teacher/gate-metrics");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message ?? body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as { data: GateMetrics };
      setData(json.data);
      setLastFetched(new Date());
    } catch {
      setError("Network error — could not load gate metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-sm text-neutral-400">
        Loading gate metrics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-3">
        <p className="text-sm font-medium text-neutral-800 dark:text-slate-200">
          Could not load gate metrics
        </p>
        <p className="text-xs text-neutral-500 dark:text-slate-400">{error}</p>
        <button
          onClick={fetchData}
          className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { cost, citations, completeness, cohort, meta } = data;

  // ── Gate verdicts ──────────────────────────────────────────────────────────
  const costCollecting = cost.inspectionsMeasured === 0;
  const costPass = !costCollecting && cost.p95CostCents <= COST_GATE_P95_CENTS;

  // No validatable refs → nothing to measure the gate against (no refs at all,
  // or every ref is for a standard the corpus does not carry — e.g. the
  // S500-clause corpus is unconfigured). Show "collecting", never pass/fail.
  const citationCollecting = citations.validatableRefs === 0;
  const citationCorpusUnconfigured =
    citations.validatableRefs === 0 && citations.totalRefs > 0;
  const citationPass =
    !citationCollecting && citations.citationErrorRate <= CITATION_GATE_MAX_RATE;

  // A completeness GO signal must clear a per-arm sample floor AND an effect-size
  // floor — otherwise n=1 vs n=1 with a +0.1pt delta would falsely pass.
  const completenessVerdict = evaluateCompletenessGate(completeness, {
    minPerArm: COMPLETENESS_MIN_PER_ARM,
    minDeltaPoints: COMPLETENESS_MIN_DELTA_POINTS,
  });
  const completenessCollecting = completenessVerdict.collecting;
  const completenessPass = completenessVerdict.pass;
  const completenessBelowSample =
    completenessVerdict.reason === "insufficient_sample";

  const allPass = costPass && citationPass && completenessPass;
  const go = allPass && cohort.sessions >= COHORT_MIN_SESSIONS;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">
            Live Teacher Pilot
          </span>
        </div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
          Gate metrics
        </h1>
        <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
          Window {new Date(meta.from).toLocaleDateString()} –{" "}
          {new Date(meta.to).toLocaleDateString()}
          {lastFetched
            ? ` · updated ${lastFetched.toLocaleTimeString()}`
            : ""}
        </p>
      </div>

      {/* ── GO-readiness banner ───────────────────────────────────────────── */}
      {go ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 px-5 py-4">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            GO — all three gates pass across {cohort.sessions} sessions
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            Cost, citation-fidelity and completeness gates are green with a
            sufficient cohort.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-slate-800 bg-neutral-50 dark:bg-slate-900/50 px-5 py-4">
          <p className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
            {cohort.sessions < COHORT_MIN_SESSIONS
              ? `Collecting data — ${cohort.sessions} of ${COHORT_MIN_SESSIONS} sessions`
              : `${[costPass, citationPass, completenessPass].filter(Boolean).length} of 3 gates passing`}
          </p>
          <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
            A GO decision needs all three gates green and at least{" "}
            {COHORT_MIN_SESSIONS} sessions.
          </p>
        </div>
      )}

      {/* ── Summary stats row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Sessions"
          value={cohort.sessions}
          sub={`${cohort.openSessions} in-flight`}
        />
        <StatTile
          label="Inspections"
          value={cohort.inspectionsMeasured}
          sub="with cost recorded"
        />
        <StatTile
          label="Assistant refs"
          value={citations.totalRefs}
          sub={`${citations.totalAssistantUtterances} utterances`}
        />
        <StatTile
          label="Completeness n"
          value={`${completeness.nAssisted}/${completeness.nControl}`}
          sub="assisted / control"
        />
      </div>

      {/* ── Three gate cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GateCard
          title="Cost per inspection"
          pass={costPass}
          collecting={costCollecting}
          headline={cost.inspectionsMeasured === 0 ? "—" : aud(cost.p95CostCents)}
          sub={`p95 cost · mean ${aud(cost.meanCostCents)} · gate ≤ ${aud(COST_GATE_P95_CENTS)}`}
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-slate-400">
              <span>Over ${(COST_GATE_P95_CENTS / 100).toFixed(0)} threshold</span>
              <span className="tabular-nums">
                {cost.overThresholdCount} ({cost.overThresholdPct}%)
              </span>
            </div>
            <ProgressBar
              value={cost.p95CostCents}
              max={COST_GATE_P95_CENTS * 2}
              colour={costPass ? "bg-emerald-400" : "bg-amber-400"}
            />
          </div>
        </GateCard>

        <GateCard
          title="Citation-error rate"
          pass={citationPass}
          collecting={citationCollecting}
          headline={
            citationCollecting
              ? "—"
              : `${(citations.citationErrorRate * 100).toFixed(1)}%`
          }
          sub={
            citationCorpusUnconfigured
              ? "collecting — citation corpus not configured"
              : citationCollecting
                ? `fabricated clauses · gate ≤ ${(CITATION_GATE_MAX_RATE * 100).toFixed(0)}%`
                : `fabricated / ${citations.validatableRefs} validatable · gate ≤ ${(CITATION_GATE_MAX_RATE * 100).toFixed(0)}%`
          }
        >
          <div className="space-y-1 text-xs text-neutral-500 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span>No such clause (gate error)</span>
              <span className="tabular-nums">
                {citations.verdictCounts.invalid_no_such_clause}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Not in corpus (collecting)</span>
              <span className="tabular-nums">{citations.unknownCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Edition mismatch (soft)</span>
              <span className="tabular-nums">
                {citations.verdictCounts.edition_mismatch}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Unparseable</span>
              <span className="tabular-nums">
                {citations.verdictCounts.unparseable}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Utterances with ≥1 bad ref</span>
              <span className="tabular-nums">
                {citations.utterancesWithInvalidRefPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </GateCard>

        <GateCard
          title="Completeness delta"
          pass={completenessPass}
          collecting={completenessCollecting}
          headline={
            completenessBelowSample || completeness.deltaPoints === null
              ? "insufficient data"
              : `${completeness.deltaPoints > 0 ? "+" : ""}${completeness.deltaPoints} pts`
          }
          sub={
            completenessBelowSample
              ? `needs ≥${COMPLETENESS_MIN_PER_ARM} per arm · have ${completeness.nAssisted}/${completeness.nControl}`
              : `assisted ${completeness.meanAssisted} vs control ${completeness.meanControl} · gate ≥ ${COMPLETENESS_MIN_DELTA_POINTS}pt`
          }
        >
          <div className="space-y-1 text-xs text-neutral-500 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span>Assisted (n={completeness.nAssisted})</span>
              <span className="tabular-nums">
                {completeness.meanAssisted ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Control (n={completeness.nControl})</span>
              <span className="tabular-nums">
                {completeness.meanControl ?? "—"}
              </span>
            </div>
          </div>
        </GateCard>
      </div>

      {/* ── Notes from API ────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-neutral-50 dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 px-4 py-3 space-y-1.5">
        <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">
          Notes
        </div>
        {meta.notes.map((n, i) => (
          <p
            key={i}
            className="text-xs text-neutral-400 dark:text-slate-500 leading-relaxed"
          >
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}
