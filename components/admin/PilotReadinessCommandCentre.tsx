"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  PilotCommandCentreSnapshot,
  PilotDecision,
  PilotGateStatus,
  PilotReadinessGate,
} from "@/lib/pilot-readiness-command-centre";

interface PilotReadinessCommandCentreProps {
  snapshot: PilotCommandCentreSnapshot;
  refreshing: boolean;
  lastFetched: Date | null;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<PilotGateStatus, string> = {
  pass: "Verified",
  warning: "In progress",
  fail: "Failed",
  unknown: "Needs evidence",
};

const STATUS_STYLES: Record<PilotGateStatus, string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  fail: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
  unknown:
    "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const DECISION_STYLES: Record<PilotDecision, string> = {
  GO: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/25",
  CONDITIONAL:
    "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/25",
  NO_GO:
    "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/25",
};

const DECISION_BADGE_STYLES: Record<PilotDecision, string> = {
  GO: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
  CONDITIONAL:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
  NO_GO:
    "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
};

function StatusIcon({ status }: { status: PilotGateStatus }) {
  const className = "h-3.5 w-3.5";
  if (status === "pass") return <CheckCircle2 className={className} />;
  if (status === "warning") return <Loader2 className={className} />;
  if (status === "fail") return <XCircle className={className} />;
  return <CircleHelp className={className} />;
}

function DecisionIcon({ decision }: { decision: PilotDecision }) {
  const className = "h-6 w-6 shrink-0";
  if (decision === "GO") {
    return <ShieldCheck className={cn(className, "text-emerald-600")} />;
  }
  if (decision === "CONDITIONAL") {
    return <AlertTriangle className={cn(className, "text-amber-600")} />;
  }
  return <XCircle className={cn(className, "text-rose-600")} />;
}

function formatEvidenceTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";

  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Brisbane",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod").toLowerCase()}`;
}

function GateRow({ gate }: { gate: PilotReadinessGate }) {
  return (
    <li
      id={`readiness-gate-${gate.id}`}
      className="grid gap-3 px-4 py-4 lg:grid-cols-[140px_190px_minmax(0,1fr)_170px_116px] lg:items-center"
    >
      <div>
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
            STATUS_STYLES[gate.status],
          )}
        >
          <StatusIcon status={gate.status} />
          <span>{STATUS_LABELS[gate.status]}</span>
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
          {gate.title}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
          {gate.owner}
        </p>
      </div>

      <p className="min-w-0 text-sm leading-5 text-neutral-600 dark:text-slate-300">
        {gate.summary}
      </p>

      <div className="text-xs text-neutral-500 dark:text-slate-400">
        <span className="mb-1 block font-medium text-neutral-700 dark:text-slate-300 lg:hidden">
          Last verified
        </span>
        {gate.verifiedAt ? (
          <time dateTime={gate.verifiedAt}>
            {formatEvidenceTime(gate.verifiedAt)}
          </time>
        ) : (
          "No evidence"
        )}
      </div>

      <a
        href={gate.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${gate.title} evidence`}
        className="inline-flex h-8 w-fit items-center gap-1.5 text-xs font-medium text-cyan-700 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-300"
      >
        Evidence
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </li>
  );
}

export function PilotReadinessCommandCentre({
  snapshot,
  refreshing,
  lastFetched,
  onRefresh,
}: PilotReadinessCommandCentreProps) {
  const decisionLabel = snapshot.decision.replace("_", "-");
  const shortCommit = snapshot.deployment.commitSha?.slice(0, 8) ?? "Unknown";

  return (
    <section aria-labelledby="pilot-readiness-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            <span className="text-xs font-semibold uppercase text-neutral-500 dark:text-slate-400">
              Operational gate
            </span>
          </div>
          <h1
            id="pilot-readiness-title"
            className="text-2xl font-bold text-neutral-900 dark:text-slate-100"
          >
            Pilot readiness
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            Live evidence for the current deployment and external pilot gate.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="hidden text-xs text-neutral-400 sm:inline dark:text-slate-500">
              Refreshed {formatEvidenceTime(lastFetched.toISOString())}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={
              refreshing ? "Refreshing readiness evidence" : "Refresh readiness"
            }
            className="h-9 gap-1.5"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-4",
          DECISION_STYLES[snapshot.decision],
        )}
        role="status"
      >
        <DecisionIcon decision={snapshot.decision} />
        <div className="min-w-0 flex-1">
          <Badge
            variant="outline"
            className={cn(
              "h-6 rounded-md px-2 text-xs font-bold",
              DECISION_BADGE_STYLES[snapshot.decision],
            )}
          >
            {decisionLabel}
          </Badge>
          <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-slate-200">
            {snapshot.summary}
          </p>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-950">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
              <Globe2 className="h-3.5 w-3.5" />
              Environment
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-slate-100">
              {snapshot.deployment.environment}
            </p>
          </div>
          {snapshot.deployment.deploymentUrl && (
            <a
              href={snapshot.deployment.deploymentUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open deployed application"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        <div className="bg-white px-4 py-3 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
            <GitBranch className="h-3.5 w-3.5" />
            Branch
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-slate-100">
            {snapshot.deployment.branch ?? "Unknown"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-950">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
              <GitCommitHorizontal className="h-3.5 w-3.5" />
              Commit
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-neutral-900 dark:text-slate-100">
              {shortCommit}
            </p>
          </div>
          {snapshot.deployment.commitUrl && (
            <a
              href={snapshot.deployment.commitUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open deployment source"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Verified", snapshot.counts.verified, "text-emerald-600"],
          ["Needs evidence", snapshot.counts.needsEvidence, "text-amber-600"],
          ["Blockers", snapshot.counts.blockers, "text-rose-600"],
        ].map(([label, value, colour]) => (
          <div
            key={label}
            className="min-w-0 rounded-lg border border-neutral-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950"
          >
            <p className="min-h-8 text-[11px] leading-4 text-neutral-500 dark:text-slate-400">
              {label}
            </p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", colour)}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
          Readiness gates
        </h2>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="hidden grid-cols-[140px_190px_minmax(0,1fr)_170px_116px] border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase text-neutral-500 lg:grid dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <span>Status</span>
            <span>Gate / owner</span>
            <span>Evidence</span>
            <span>Last verified</span>
            <span>Source</span>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-slate-800">
            {snapshot.gates.map((gate) => (
              <GateRow key={gate.id} gate={gate} />
            ))}
          </ul>
        </div>
      </div>

      {snapshot.blockers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-slate-200">
            Pilot blockers
          </h2>
          <ul className="divide-y divide-rose-200 overflow-hidden rounded-lg border border-rose-200 bg-rose-50/60 dark:divide-rose-900 dark:border-rose-900 dark:bg-rose-950/20">
            {snapshot.blockers.map((gate) => (
              <li key={gate.id} className="flex gap-3 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                    {gate.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-5 text-rose-800 dark:text-rose-300">
                    {gate.nextAction}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
