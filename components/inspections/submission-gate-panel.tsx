"use client";

/**
 * Sprint G: Submission Gate Panel
 * [RA-401] Pre-submission evidence validation UI.
 * Shows blocking gaps, warnings, and evidence score before allowing submit.
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  SubmissionValidationResult,
  EvidenceGap,
} from "@/lib/evidence/submission-validator";

interface SubmissionGatePanelProps {
  inspectionId: string;
  isReadyToSubmit: boolean;
  onSubmit: () => void;
  submitting: boolean;
}

export function SubmissionGatePanel({
  inspectionId,
  isReadyToSubmit,
  onSubmit,
  submitting,
}: SubmissionGatePanelProps) {
  const [validation, setValidation] =
    useState<SubmissionValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const runValidation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/workflow/validate`,
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Validation failed");
        return;
      }
      const data = await res.json();
      setValidation(data.validation);
    } catch (err) {
      setError("Failed to validate — check your connection");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  // Auto-validate when panel mounts or isReadyToSubmit changes
  useEffect(() => {
    if (isReadyToSubmit) {
      runValidation();
    }
  }, [isReadyToSubmit, runValidation]);

  if (!isReadyToSubmit) return null;

  // Loading state
  if (loading) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Validating evidence completeness...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-5 mb-6">
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-400">
            {error}
          </span>
          <Button variant="outline" size="sm" onClick={runValidation}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!validation) return null;

  const canSubmit = validation.canSubmit;
  const hasWarnings = validation.warningGaps.length > 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 mb-6",
        canSubmit
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            canSubmit
              ? "bg-green-100 dark:bg-green-900/30"
              : "bg-red-100 dark:bg-red-900/30",
          )}
        >
          {canSubmit ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Shield className="h-5 w-5 text-red-600" />
          )}
        </div>
        <div className="flex-1">
          <h3
            className={cn(
              "text-sm font-semibold",
              canSubmit
                ? "text-green-800 dark:text-green-300"
                : "text-red-800 dark:text-red-300",
            )}
          >
            {canSubmit
              ? "Evidence validation passed"
              : `${validation.blockingGaps.length} issue${validation.blockingGaps.length !== 1 ? "s" : ""} must be resolved`}
          </h3>
          <p
            className={cn(
              "text-xs mt-0.5",
              canSubmit
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400",
            )}
          >
            Evidence score: {validation.score}% · {validation.completedSteps}/
            {validation.totalSteps} steps complete
            {hasWarnings &&
              ` · ${validation.warningGaps.length} warning${validation.warningGaps.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Submit or details toggle */}
        <div className="flex items-center gap-2">
          {(validation.blockingGaps.length > 0 ||
            validation.warningGaps.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span className="ml-1">Details</span>
            </Button>
          )}
          {canSubmit && (
            <Button
              onClick={onSubmit}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Submit Inspection
            </Button>
          )}
        </div>
      </div>

      {/* Details section */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
          {/* Blocking gaps */}
          {validation.blockingGaps.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-2">
                Must Resolve ({validation.blockingGaps.length})
              </h4>
              <div className="space-y-2">
                {validation.blockingGaps.map((gap, i) => (
                  <GapRow key={i} gap={gap} severity="blocking" />
                ))}
              </div>
            </div>
          )}

          {/* Warning gaps */}
          {validation.warningGaps.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">
                Warnings ({validation.warningGaps.length})
              </h4>
              <div className="space-y-2">
                {validation.warningGaps.map((gap, i) => (
                  <GapRow key={i} gap={gap} severity="warning" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Single gap row */
function GapRow({
  gap,
  severity,
}: {
  gap: EvidenceGap;
  severity: "blocking" | "warning";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2.5 rounded-lg border text-xs",
        severity === "blocking"
          ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
          : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10",
      )}
    >
      {severity === "blocking" ? (
        <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1">
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {gap.stepTitle}
        </span>
        <span className="text-slate-500 dark:text-slate-400 ml-1.5">
          {gap.detail}
        </span>
        {gap.s500Ref && (
          <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {gap.s500Ref}
          </span>
        )}
      </div>
      {gap.riskTier >= 2 && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex-shrink-0">
          <Shield className="h-2.5 w-2.5" /> T{gap.riskTier}
        </span>
      )}
    </div>
  );
}
