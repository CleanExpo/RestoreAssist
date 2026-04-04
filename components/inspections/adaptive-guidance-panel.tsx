"use client";

/**
 * Sprint G: Adaptive Guidance Panel
 * [RA-400] Experience-level adaptive guidance component
 *
 * Apprentice mode: sub-step checklists, confirming questions, tips, common mistakes
 * Experienced mode: exception-only alerts, consolidated minimal view
 */

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Lightbulb,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getStepGuidance,
  hasApprenticeGuidance,
  hasExperiencedAlerts,
  getRequiredConfirmations,
} from "@/lib/evidence/adaptive-guidance";
import type { StepGuidance } from "@/lib/evidence/adaptive-guidance";

// ============================================
// TYPES
// ============================================

interface AdaptiveGuidancePanelProps {
  stepKey: string;
  stepTitle: string;
  stepDescription: string | null;
  stepDescriptionShort: string | null;
  escalationNote: string | null;
  riskTier: number;
  isApprentice: boolean;
  stepStatus: string;
  /** Callback when all required confirmations are answered — gates step completion */
  onConfirmationsComplete?: (allConfirmed: boolean) => void;
}

// ============================================
// COMPONENT
// ============================================

export function AdaptiveGuidancePanel({
  stepKey,
  stepTitle,
  stepDescription,
  stepDescriptionShort,
  escalationNote,
  riskTier,
  isApprentice,
  stepStatus,
  onConfirmationsComplete,
}: AdaptiveGuidancePanelProps) {
  const guidance = getStepGuidance(stepKey);
  const [checkedSubSteps, setCheckedSubSteps] = useState<Set<string>>(
    new Set(),
  );
  const [confirmedQuestions, setConfirmedQuestions] = useState<Set<string>>(
    new Set(),
  );
  const [showTips, setShowTips] = useState(false);
  const [showMistakes, setShowMistakes] = useState(false);

  // Reset state when step changes
  useEffect(() => {
    setCheckedSubSteps(new Set());
    setConfirmedQuestions(new Set());
    setShowTips(false);
    setShowMistakes(false);
  }, [stepKey]);

  // Notify parent about confirmation status
  useEffect(() => {
    if (!onConfirmationsComplete) return;
    const requiredQs = getRequiredConfirmations(stepKey);
    if (requiredQs.length === 0) {
      onConfirmationsComplete(true);
      return;
    }
    const allConfirmed = requiredQs.every((q) => confirmedQuestions.has(q.id));
    onConfirmationsComplete(allConfirmed);
  }, [confirmedQuestions, stepKey, onConfirmationsComplete]);

  const toggleSubStep = useCallback((id: string) => {
    setCheckedSubSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleConfirmation = useCallback((id: string) => {
    setConfirmedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const hasGuidance = hasApprenticeGuidance(stepKey);
  const hasAlerts = hasExperiencedAlerts(stepKey);

  // ============================================
  // EXPERIENCED MODE — minimal, exception-only
  // ============================================
  if (!isApprentice) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-6">
        {/* Short description only */}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {stepDescriptionShort || stepDescription}
        </p>

        {/* Exception-only alerts for experienced users */}
        {hasAlerts && (
          <div className="mt-3 space-y-2">
            {guidance.experiencedAlerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {alert}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Escalation note (shown in both modes) */}
        {escalationNote && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {escalationNote}
              </p>
            </div>
          </div>
        )}

        {/* Risk tier badge for high-risk steps */}
        {riskTier >= 2 && (
          <div className="mt-3 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-red-500" />
            <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
              Risk Tier {riskTier} — Additional scrutiny required
            </span>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // APPRENTICE MODE — verbose, sub-steps, confirmations
  // ============================================
  return (
    <div className="space-y-4 mb-6">
      {/* Detailed description panel */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
            Apprentice Guidance
          </span>
          {riskTier >= 2 && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              <Shield className="h-3 w-3" />
              Risk Tier {riskTier}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {stepDescription}
        </p>

        {/* Escalation note */}
        {escalationNote && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {escalationNote}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sub-steps checklist */}
      {guidance.subSteps.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-800/50 p-5">
          <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-3">
            Sub-Steps Checklist
          </h4>
          <div className="space-y-2.5">
            {guidance.subSteps.map((sub) => {
              const checked = checkedSubSteps.has(sub.id);
              return (
                <button
                  key={sub.id}
                  onClick={() => toggleSubStep(sub.id)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                    checked
                      ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-blue-300 dark:hover:border-blue-700",
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {checked ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        checked
                          ? "text-green-700 dark:text-green-400 line-through"
                          : "text-slate-800 dark:text-slate-200",
                      )}
                    >
                      {sub.label}
                    </span>
                    {sub.detail && !checked && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {sub.detail}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {/* Progress indicator */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${guidance.subSteps.length > 0 ? (checkedSubSteps.size / guidance.subSteps.length) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {checkedSubSteps.size}/{guidance.subSteps.length}
            </span>
          </div>
        </div>
      )}

      {/* Confirming questions — gate step completion */}
      {guidance.confirmingQuestions.length > 0 &&
        stepStatus === "IN_PROGRESS" && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-violet-200 dark:border-violet-800/50 p-5">
            <h4 className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide mb-3">
              Before You Continue
            </h4>
            <div className="space-y-2.5">
              {guidance.confirmingQuestions.map((q) => {
                const confirmed = confirmedQuestions.has(q.id);
                return (
                  <button
                    key={q.id}
                    onClick={() => toggleConfirmation(q.id)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                      confirmed
                        ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10"
                        : q.required
                          ? "border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/10 hover:border-violet-300"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-slate-300",
                    )}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {confirmed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Circle
                          className={cn(
                            "h-4 w-4",
                            q.required ? "text-violet-400" : "text-slate-400",
                          )}
                        />
                      )}
                    </div>
                    <div>
                      <span
                        className={cn(
                          "text-sm",
                          confirmed
                            ? "text-green-700 dark:text-green-400"
                            : "text-slate-800 dark:text-slate-200",
                        )}
                      >
                        {q.question}
                      </span>
                      {q.required && !confirmed && (
                        <span className="ml-2 text-[10px] text-violet-500 dark:text-violet-400 font-medium">
                          Required
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

      {/* Tips & Common Mistakes — collapsible sections */}
      {(guidance.tips.length > 0 || guidance.commonMistakes.length > 0) && (
        <div className="flex gap-3">
          {/* Tips */}
          {guidance.tips.length > 0 && (
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800/50 overflow-hidden">
              <button
                onClick={() => setShowTips((v) => !v)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                    Tips ({guidance.tips.length})
                  </span>
                </div>
                {showTips ? (
                  <ChevronUp className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-emerald-400" />
                )}
              </button>
              {showTips && (
                <div className="px-4 pb-4 space-y-2">
                  {guidance.tips.map((tip, i) => (
                    <p
                      key={i}
                      className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed pl-6"
                    >
                      {tip}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Common Mistakes */}
          {guidance.commonMistakes.length > 0 && (
            <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-800/50 overflow-hidden">
              <button
                onClick={() => setShowMistakes((v) => !v)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                    Avoid ({guidance.commonMistakes.length})
                  </span>
                </div>
                {showMistakes ? (
                  <ChevronUp className="h-4 w-4 text-red-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-red-400" />
                )}
              </button>
              {showMistakes && (
                <div className="px-4 pb-4 space-y-2">
                  {guidance.commonMistakes.map((mistake, i) => (
                    <p
                      key={i}
                      className="text-xs text-red-800 dark:text-red-300 leading-relaxed pl-6"
                    >
                      {mistake}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
