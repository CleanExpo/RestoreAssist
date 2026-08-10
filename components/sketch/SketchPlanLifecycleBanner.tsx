"use client";

/**
 * Compact plan lifecycle banner — scan → waiting → confirm → plan-ready.
 * RestoreAssist copy only (no Encircle product naming).
 */

import { cn } from "@/lib/utils";
import type { PlanLifecyclePhase } from "@/lib/sketch/plan-lifecycle";
import { CheckCircle2, Loader2, ScanLine, Ruler } from "lucide-react";

export interface SketchPlanLifecycleBannerProps {
  phase: PlanLifecyclePhase;
  onConfirmPlan?: () => void;
  onOpenAdvanced?: () => void;
  className?: string;
}

const COPY: Record<
  Exclude<PlanLifecyclePhase, "empty">,
  { title: string; body: string }
> = {
  scanning: {
    title: "Capturing rooms…",
    body: "Hold steady — rooms will appear on the plan when the scan finishes.",
  },
  waiting: {
    title: "Plan in progress",
    body: "Trace the underlay or wait for scan rooms. Moisture pins work anytime.",
  },
  needs_confirm: {
    title: "Confirm measurements",
    body: "Review scanned rooms, confirm each one, then annotate in Quick edit.",
  },
  plan_ready: {
    title: "Plan ready",
    body: "Label, measure, or open Advanced draw for walls and openings.",
  },
};

export function SketchPlanLifecycleBanner({
  phase,
  onConfirmPlan,
  onOpenAdvanced,
  className,
}: SketchPlanLifecycleBannerProps) {
  if (phase === "empty") return null;
  const copy = COPY[phase];
  const Icon =
    phase === "scanning"
      ? Loader2
      : phase === "waiting"
        ? ScanLine
        : phase === "needs_confirm"
          ? Ruler
          : CheckCircle2;

  return (
    <div
      className={cn(
        "absolute top-3 left-1/2 z-20 -translate-x-1/2 max-w-lg w-[calc(100%-1.5rem)]",
        "rounded-xl border border-white/15 bg-brand-navy/92 backdrop-blur-md shadow-lg",
        "px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
      role="status"
      aria-live="polite"
      data-plan-phase={phase}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <Icon
          size={18}
          className={cn(
            "shrink-0 mt-0.5",
            phase === "scanning" && "animate-spin text-emerald-300",
            phase === "waiting" && "text-cyan-300",
            phase === "needs_confirm" && "text-amber-300",
            phase === "plan_ready" && "text-emerald-300",
          )}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white leading-tight">
            {copy.title}
          </p>
          <p className="text-[11px] text-white/55 leading-snug mt-0.5">
            {copy.body}
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0 self-end sm:self-center">
        {phase === "needs_confirm" && onConfirmPlan && (
          <button
            type="button"
            onClick={onConfirmPlan}
            className="min-h-9 px-3 rounded-lg bg-emerald-500/25 border border-emerald-400/40 text-emerald-50 text-xs font-medium hover:bg-emerald-500/35"
          >
            Mark confirmed
          </button>
        )}
        {(phase === "plan_ready" || phase === "needs_confirm") &&
          onOpenAdvanced && (
            <button
              type="button"
              onClick={onOpenAdvanced}
              className="min-h-9 px-3 rounded-lg bg-white/5 border border-white/15 text-white/80 text-xs font-medium hover:bg-white/10"
            >
              Advanced draw
            </button>
          )}
      </div>
    </div>
  );
}
