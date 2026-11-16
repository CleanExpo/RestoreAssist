"use client";

/**
 * Sprint G: Submission Gate Panel
 * [RA-401] Pre-submission evidence validation UI.
 * Shows blocking gaps, warnings, and evidence score before allowing submit.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { captureStepHref } from "@/lib/evidence/field-evidence-checklist-view";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";
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
  /**
   * RA-8388: called with a gap's stepKey when the technician selects it.
   * The capture page passes this so the step opens in place. Without it each
   * gap is a link to the capture page at that step.
   */
  onSelectStep?: (stepKey: string) => void;
}

export function SubmissionGatePanel({
  inspectionId,
  isReadyToSubmit,
  onSubmit,
  submitting,
  onSelectStep,
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
        setError(apiErrorMessage(data) ?? "Validation failed");
        return;
      }
      const data = await res.json();
      setValidation(data.validation);
      // RA-8388: when something blocks, show what it is straight away. The
      // list used to sit behind "Details", so the panel read as a count with
      // nothing to act on.
      if ((data.validation?.blockingGaps?.length ?? 0) > 0) {
        setShowDetails(true);
      }
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
          <XCircle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">
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
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <Shield className="h-5 w-5 text-destructive" />
          )}
        </div>
        <div className="flex-1">
          <h3
            className={cn(
              "text-sm font-semibold",
              canSubmit
                ? "text-success"
                : "text-destructive",
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
                ? "text-success"
                : "text-destructive",
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
              <h4 className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">
                Must Resolve ({validation.blockingGaps.length})
              </h4>
              <div className="space-y-2">
                {validation.blockingGaps.map((gap, i) => (
                  <GapRow
                    key={i}
                    gap={gap}
                    severity="blocking"
                    inspectionId={inspectionId}
                    onSelectStep={onSelectStep}
                  />
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
                  <GapRow
                    key={i}
                    gap={gap}
                    severity="warning"
                    inspectionId={inspectionId}
                    onSelectStep={onSelectStep}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Single gap row.
 *
 * RA-8388: a gap that names a real workflow step is selectable and takes the
 * technician to that step. Synthetic gaps (stepKey starting with "_", such as
 * the QA score gate) have no step to go to, so they stay plain text rather
 * than offering a control that leads nowhere.
 */
function GapRow({
  gap,
  severity,
  inspectionId,
  onSelectStep,
}: {
  gap: EvidenceGap;
  severity: "blocking" | "warning";
  inspectionId: string;
  onSelectStep?: (stepKey: string) => void;
}) {
  const className = cn(
    "flex w-full items-start gap-2 p-2.5 rounded-lg border text-xs text-left",
    severity === "blocking"
      ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
      : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10",
  );
  const selectableClassName = cn(
    className,
    "cursor-pointer hover:bg-white dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
  );
  const hasStep = gap.stepKey.length > 0 && !gap.stepKey.startsWith("_");
  const body = <GapRowBody gap={gap} severity={severity} selectable={hasStep} />;

  if (!hasStep) {
    return <div className={className}>{body}</div>;
  }
  if (onSelectStep) {
    return (
      <button
        type="button"
        className={selectableClassName}
        onClick={() => onSelectStep(gap.stepKey)}
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      href={captureStepHref(inspectionId, gap.stepKey)}
      className={selectableClassName}
    >
      {body}
    </Link>
  );
}

function GapRowBody({
  gap,
  severity,
  selectable,
}: {
  gap: EvidenceGap;
  severity: "blocking" | "warning";
  selectable: boolean;
}) {
  return (
    <>
      {severity === "blocking" ? (
        <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
      )}
      <span className="flex-1">
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
        {selectable && (
          <span className="block text-[11px] font-medium text-blue-700 dark:text-blue-300 mt-1">
            Go to this step
          </span>
        )}
      </span>
      {gap.riskTier >= 2 && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive-subtle text-destructive-subtle-foreground flex-shrink-0">
          <Shield className="h-2.5 w-2.5" /> T{gap.riskTier}
        </span>
      )}
    </>
  );
}
