"use client";

/**
 * Deskilling Scorecard — Admin Dashboard (RA-1135)
 *
 * Shows the 4-tier KPI snapshot and anonymised technician leaderboard.
 * Tiers 1/3/4 are populated after the first monthly audit run.
 */

import { useEffect, useState } from "react";
import { TrendingDown, Clock, AlertTriangle, ShieldCheck, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeskillingScorecardSnapshot, TechnicianScorecardEntry } from "@/lib/deskilling-scorecard/types";
import { SCORECARD_BASELINES, SCORECARD_TARGETS } from "@/lib/deskilling-scorecard/types";

interface ApiResponse {
  snapshot: DeskillingScorecardSnapshot;
  leaderboard: TechnicianScorecardEntry[];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function statusColor(value: number, target: number, lower = true): string {
  const onTrack = lower ? value <= target : value >= target;
  if (onTrack) return "text-emerald-400";
  const halfway = lower ? value <= target * 1.5 : value >= target * 0.5;
  return halfway ? "text-amber-400" : "text-rose-400";
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  tier: number;
  title: string;
  icon: React.ElementType;
  baseline: string;
  target: string;
  current: string | null;
  statusClass: string;
  pending: boolean;
  note?: string;
}

function KpiCard({ tier, title, icon: Icon, baseline, target, current, statusClass, pending, note }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1b2e] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Icon size={16} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-white/40 uppercase tracking-wide">Tier {tier}</p>
            <p className="text-sm font-semibold text-white">{title}</p>
          </div>
        </div>
        {pending && (
          <span className="text-xs text-white/30 bg-white/5 rounded px-2 py-0.5">Awaiting audit</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-white/30 mb-1">Baseline</p>
          <p className="text-base font-mono text-white/60">{baseline}</p>
        </div>
        <div>
          <p className="text-xs text-white/30 mb-1">Target</p>
          <p className="text-base font-mono text-white/60">{target}</p>
        </div>
        <div>
          <p className="text-xs text-white/30 mb-1">Current</p>
          {current != null ? (
            <p className={cn("text-base font-mono font-semibold", statusClass)}>{current}</p>
          ) : (
            <p className="text-base font-mono text-white/20">—</p>
          )}
        </div>
      </div>

      {note && <p className="text-xs text-white/30 leading-relaxed">{note}</p>}
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function DeskillingScorecardPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deskilling-scorecard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scorecard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const snap = data?.snapshot;

  // ── Tier 2 current values ──────────────────────────────────────────────────
  const t2Senior = snap?.tier2?.seniorAvgMinutes ?? null;
  const t2Junior = snap?.tier2?.juniorAvgMinutes ?? null;
  const t2Display = t2Senior != null && t2Junior != null
    ? `${t2Senior}m / ${t2Junior}m`
    : t2Senior != null ? `${t2Senior}m` : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Deskilling Scorecard</h1>
          <p className="text-sm text-white/40 mt-1">
            KPI framework proving "AI Carries the Smart" — 4 tiers, quarterly cadence
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 text-white/30 py-16">
          <Loader2 size={16} className="animate-spin" />
          Loading scorecard…
        </div>
      )}

      {/* KPI Cards */}
      {snap && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KpiCard
            tier={1}
            title="Junior vs Senior Quality Delta"
            icon={TrendingDown}
            baseline={`${SCORECARD_BASELINES.tier1_qualityDelta} pts`}
            target={`<${SCORECARD_TARGETS.tier1_qualityDelta} pts`}
            current={snap.tier1 != null ? `${snap.tier1.delta} pts` : null}
            statusClass={snap.tier1 ? statusColor(snap.tier1.delta, SCORECARD_TARGETS.tier1_qualityDelta) : ""}
            pending={snap.tier1 == null}
            note="Senior avg score − junior avg score on same job type. Measured by monthly blind Claude review of 40 reports."
          />

          <KpiCard
            tier={2}
            title="Time-to-Submission"
            icon={Clock}
            baseline={`${SCORECARD_BASELINES.tier2_seniorMinutes}m / ${SCORECARD_BASELINES.tier2_juniorMinutes}m`}
            target={`${SCORECARD_TARGETS.tier2_minutes}m both`}
            current={t2Display}
            statusClass={
              t2Junior != null
                ? statusColor(t2Junior, SCORECARD_TARGETS.tier2_minutes)
                : ""
            }
            pending={snap.tier2 == null}
            note="Senior / Junior minutes from LiveTeacher session start to Inspection.submittedAt. Live data, 90-day rolling."
          />

          <KpiCard
            tier={3}
            title="Scope / Equipment Error Rate"
            icon={AlertTriangle}
            baseline={pct(SCORECARD_BASELINES.tier3_errorRate)}
            target={`<${pct(SCORECARD_TARGETS.tier3_errorRate)}`}
            current={snap.tier3 != null ? pct(snap.tier3.errorRate) : null}
            statusClass={snap.tier3 ? statusColor(snap.tier3.errorRate, SCORECARD_TARGETS.tier3_errorRate) : ""}
            pending={snap.tier3 == null}
            note="Auto-comparison of technician scope to Claude gold-standard scope on representative jobs. Monthly audit."
          />

          <KpiCard
            tier={4}
            title="Compliance Flags Caught"
            icon={ShieldCheck}
            baseline={pct(SCORECARD_BASELINES.tier4_complianceRate)}
            target={pct(SCORECARD_TARGETS.tier4_complianceRate)}
            current={snap.tier4 != null ? pct(snap.tier4.catchRate) : null}
            statusClass={snap.tier4 ? statusColor(snap.tier4.catchRate, SCORECARD_TARGETS.tier4_complianceRate, false) : ""}
            pending={snap.tier4 == null}
            note="Mandatory compliance fields: make-safe, AS/NZS 4849.1, SafeWork trigger, NZBS, variation notices. Monthly audit."
          />
        </div>
      )}

      {/* Technician Leaderboard */}
      {data && data.leaderboard.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/70">Technician Leaderboard</h2>
            <p className="text-xs text-white/30">Anonymised · 90-day rolling · sorted by submission speed</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0d1b2e] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-2.5 text-white/40 font-medium">Technician</th>
                  <th className="text-center px-3 py-2.5 text-white/40 font-medium">Level</th>
                  <th className="text-right px-3 py-2.5 text-white/40 font-medium">Inspections</th>
                  <th className="text-right px-4 py-2.5 text-white/40 font-medium">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((tech, idx) => (
                  <tr key={tech.userId} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 text-white font-medium">{tech.displayName}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-medium",
                        tech.isJunior
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {tech.isJunior ? "Junior" : "Senior"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-white/60">{tech.reportCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {tech.avgSubmissionMinutes != null ? (
                        <span className={statusColor(tech.avgSubmissionMinutes, SCORECARD_TARGETS.tier2_minutes)}>
                          {tech.avgSubmissionMinutes}m
                        </span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit schedule notice */}
      {snap && (
        <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-xs text-white/40 leading-relaxed">
          <strong className="text-white/60">Tiers 1, 3, 4</strong> require the monthly audit cron to run
          ({" "}<code className="font-mono">GET /api/cron/deskilling-audit</code>) which samples 40 inspections
          and runs a blind Claude review. Once the first audit completes, the &ldquo;Awaiting audit&rdquo; placeholders
          will show live data.
        </div>
      )}
    </div>
  );
}
