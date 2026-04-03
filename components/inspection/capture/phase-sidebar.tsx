"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Check, MapPin } from "lucide-react";
import type { WorkflowPhase, PhaseEvidenceRule } from "@/lib/evidence";

interface PhaseSidebarProps {
  inspectionNumber: string;
  propertyAddress: string;
  phases: WorkflowPhase[];
  currentPhaseIndex: number;
  evidenceCounts: Record<string, number>; // keyed by `${phase}_${evidenceClass}`
  onJumpToPhase: (index: number) => void;
}

function getPhaseRequiredCount(phase: WorkflowPhase): number {
  return phase.evidenceRules.reduce((sum, r) => sum + r.minCount, 0);
}

function getPhaseCapturedCount(
  phase: WorkflowPhase,
  evidenceCounts: Record<string, number>,
): number {
  return phase.evidenceRules.reduce((sum, r) => {
    const key = `${phase.phase}_${r.evidenceClass}`;
    const captured = evidenceCounts[key] ?? 0;
    return sum + Math.min(captured, r.minCount);
  }, 0);
}

function isPhaseComplete(
  phase: WorkflowPhase,
  evidenceCounts: Record<string, number>,
): boolean {
  return phase.evidenceRules
    .filter((r) => r.requirement === "required")
    .every((r) => {
      const key = `${phase.phase}_${r.evidenceClass}`;
      return (evidenceCounts[key] ?? 0) >= r.minCount;
    });
}

export function PhaseSidebar({
  inspectionNumber,
  propertyAddress,
  phases,
  currentPhaseIndex,
  evidenceCounts,
  onJumpToPhase,
}: PhaseSidebarProps) {
  return (
    <div className="flex h-full w-72 flex-col border-r border-white/10 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/10 p-4">
        <p className="text-sm font-medium text-white">{inspectionNumber}</p>
        <div className="mt-1 flex items-start gap-1.5 text-xs text-zinc-400">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{propertyAddress}</span>
        </div>
      </div>

      {/* Phase list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {phases.map((phase, idx) => {
            const required = getPhaseRequiredCount(phase);
            const captured = getPhaseCapturedCount(phase, evidenceCounts);
            const complete = isPhaseComplete(phase, evidenceCounts);
            const isCurrent = idx === currentPhaseIndex;

            return (
              <button
                key={phase.phase}
                onClick={() => onJumpToPhase(idx)}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                  isCurrent
                    ? "border border-cyan-500/40 bg-cyan-500/10"
                    : "hover:bg-white/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-cyan-400" : "text-zinc-300",
                    )}
                  >
                    {phase.displayName}
                  </span>
                  {complete && <Check className="h-4 w-4 text-emerald-400" />}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-1 rounded-full transition-all",
                        complete ? "bg-emerald-400" : "bg-cyan-500",
                      )}
                      style={{
                        width:
                          required > 0
                            ? `${Math.min(100, (captured / required) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {captured}/{required}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
