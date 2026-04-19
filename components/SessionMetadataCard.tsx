"use client";

import {
  EvaluatorScores,
  FanOutSession,
  PhaseProgress,
  PHASE_LABELS,
  PhaseId,
  aggregateEvaluatorScore,
  countCompletedPhases,
  scoreColour,
  scoreBgColour,
} from "@/lib/session-types";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  GitBranch,
  Star,
} from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Phase progress bar
// ---------------------------------------------------------------------------

interface PhaseProgressBarProps {
  phases: PhaseProgress[];
}

export function PhaseProgressBar({ phases }: PhaseProgressBarProps) {
  const { completed, total } = countCompletedPhases(phases);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 font-medium">Phase Progress</span>
        <span className="text-slate-300">
          {completed}/{total} phases
        </span>
      </div>
      <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1 flex-wrap">
        {phases.map((p) => {
          const label = PHASE_LABELS[p.phase as PhaseId] ?? `Phase ${p.phase}`;
          return (
            <span
              key={p.phase}
              title={label}
              className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold transition-colors ${
                p.completed
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "bg-slate-700/50 text-slate-500 border border-slate-600/30"
              }`}
            >
              {p.phase}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evaluator score badge (compact)
// ---------------------------------------------------------------------------

interface EvaluatorScoreBadgeProps {
  scores: EvaluatorScores;
}

export function EvaluatorScoreBadge({ scores }: EvaluatorScoreBadgeProps) {
  const aggregate = aggregateEvaluatorScore(scores);
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium tabular-nums ${scoreBgColour(aggregate)} ${scoreColour(aggregate)}`}
    >
      <Star size={11} />
      <span>{aggregate}/100</span>
      {(scores.retryCount ?? 0) > 0 && (
        <span className="flex items-center gap-0.5 text-orange-400 ml-1 tabular-nums">
          <RefreshCw size={10} />
          {scores.retryCount}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evaluator score breakdown (expanded)
// ---------------------------------------------------------------------------

interface EvaluatorScoreBreakdownProps {
  scores: EvaluatorScores;
}

export function EvaluatorScoreBreakdown({
  scores,
}: EvaluatorScoreBreakdownProps) {
  const dimensions: {
    key: keyof Omit<EvaluatorScores, "retriedAt" | "retryCount">;
    label: string;
  }[] = [
    { key: "accuracy", label: "Accuracy" },
    { key: "completeness", label: "Completeness" },
    { key: "compliance", label: "Compliance" },
    { key: "clarity", label: "Clarity" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">
          Evaluator Scores
        </span>
        {(scores.retryCount ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-xs text-orange-400">
            <RefreshCw size={11} />
            {scores.retryCount} retr{scores.retryCount === 1 ? "y" : "ies"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {dimensions.map(({ key, label }) => {
          const dim = scores[key];
          return (
            <div
              key={key}
              className={`flex items-center justify-between px-2 py-1 rounded text-xs ${scoreBgColour(dim.score)}`}
              title={dim.feedback ?? label}
            >
              <span className="text-slate-300">{label}</span>
              <span className={`font-bold ${scoreColour(dim.score)}`}>
                {dim.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fan-out session list (collapsed by default)
// ---------------------------------------------------------------------------

interface FanOutSessionListProps {
  sessions: FanOutSession[];
}

const sessionStatusConfig: Record<
  FanOutSession["status"],
  { label: string; colour: string; icon: React.ElementType }
> = {
  pending: { label: "Pending", colour: "text-slate-400", icon: Clock },
  running: { label: "Running", colour: "text-blue-400", icon: Clock },
  completed: { label: "Done", colour: "text-emerald-400", icon: CheckCircle },
  failed: { label: "Failed", colour: "text-red-400", icon: AlertTriangle },
  retrying: { label: "Retrying", colour: "text-orange-400", icon: RefreshCw },
};

export function FanOutSessionList({ sessions }: FanOutSessionListProps) {
  const [expanded, setExpanded] = useState(false);

  const completedCount = sessions.filter(
    (s) => s.status === "completed",
  ).length;
  const failedCount = sessions.filter((s) => s.status === "failed").length;

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center justify-between w-full text-xs group"
      >
        <span className="flex items-center gap-1.5 text-slate-400 font-medium group-hover:text-slate-300 transition-colors">
          <GitBranch size={12} />
          {sessions.length} fan-out session{sessions.length !== 1 ? "s" : ""}
        </span>
        <span className="text-slate-500">
          {completedCount}/{sessions.length} done
          {failedCount > 0 && (
            <span className="text-red-400 ml-1">· {failedCount} failed</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-1 pl-2 border-l border-slate-700/50">
          {sessions.map((s) => {
            const cfg = sessionStatusConfig[s.status];
            const Icon = cfg.icon;
            const avg =
              s.evaluatorScores != null
                ? aggregateEvaluatorScore(s.evaluatorScores)
                : null;

            return (
              <div
                key={s.sessionId}
                className="flex items-center justify-between text-xs py-0.5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon size={11} className={cfg.colour} />
                  <span
                    className="text-slate-300 truncate max-w-[140px]"
                    title={s.section}
                  >
                    {s.section}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {avg != null && (
                    <span className={`font-medium ${scoreColour(avg)}`}>
                      {avg}
                    </span>
                  )}
                  {(s.evaluatorScores?.retryCount ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5 text-orange-400">
                      <RefreshCw size={9} />
                      {s.evaluatorScores!.retryCount}
                    </span>
                  )}
                  <span className={cfg.colour}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main composite component
// ---------------------------------------------------------------------------

interface SessionMetadataCardProps {
  /** Phase progress array (top-level session) */
  phases?: PhaseProgress[];
  /** Evaluator scores (top-level session) */
  evaluatorScores?: EvaluatorScores;
  /** Child fan-out sessions */
  fanOutSessions?: FanOutSession[];
  /** Compact mode: score badge only, no phase bar */
  compact?: boolean;
}

/**
 * SessionMetadataCard renders the fan-out and evaluator data for a report.
 * When none of the data fields are present the component renders nothing,
 * so it is safe to include unconditionally on older reports.
 */
export default function SessionMetadataCard({
  phases,
  evaluatorScores,
  fanOutSessions,
  compact = false,
}: SessionMetadataCardProps) {
  const hasPhases = phases && phases.length > 0;
  const hasScores = evaluatorScores != null;
  const hasFanOut = fanOutSessions && fanOutSessions.length > 0;

  if (!hasPhases && !hasScores && !hasFanOut) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {hasScores && <EvaluatorScoreBadge scores={evaluatorScores} />}
        {hasPhases && (
          <span className="text-xs text-slate-400">
            {countCompletedPhases(phases).completed}/{phases.length} phases
          </span>
        )}
        {hasFanOut && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <GitBranch size={11} />
            {fanOutSessions.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-3">
      {hasPhases && <PhaseProgressBar phases={phases} />}
      {hasScores && <EvaluatorScoreBreakdown scores={evaluatorScores} />}
      {hasFanOut && <FanOutSessionList sessions={fanOutSessions} />}
    </div>
  );
}
