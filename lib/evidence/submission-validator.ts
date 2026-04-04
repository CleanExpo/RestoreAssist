/**
 * Sprint G: Submission Gate — Evidence Validation
 * [RA-401] Block incomplete inspections from submission.
 * Missing items flagged. Exception reasons required for skipped items.
 * Admin notification on submission.
 *
 * [RA-411] QA score integration — evidence quality check before submission.
 *
 * This validator checks the InspectionWorkflow and its steps to ensure
 * all mandatory evidence has been captured or properly excepted.
 */

import {
  scoreInspectionEvidence,
  type EvidenceItemForQA,
  type InspectionQAResult,
} from "./qa-scorer";

// ============================================
// TYPES
// ============================================

export interface EvidenceGap {
  stepKey: string;
  stepTitle: string;
  riskTier: number;
  issue: "missing_evidence" | "missing_exception_reason" | "below_minimum";
  detail: string;
  /** S500:2025 clause reference if applicable */
  s500Ref?: string;
}

export interface SubmissionValidationResult {
  /** Whether the inspection can be submitted */
  canSubmit: boolean;
  /** Overall submission score (0-100) */
  score: number;
  /** Blocking gaps — must be resolved before submission */
  blockingGaps: EvidenceGap[];
  /** Warning gaps — non-blocking but flagged for admin review */
  warningGaps: EvidenceGap[];
  /** Summary counts */
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  /** Steps with proper exception reasons */
  properlyExceptedSteps: number;
  /** Mandatory steps still incomplete */
  incompleteMandatorySteps: number;
}

export interface WorkflowStepForValidation {
  id: string;
  stepKey: string;
  stepTitle: string;
  status: string;
  isMandatory: boolean;
  riskTier: number;
  minimumEvidenceCount: number;
  requiredEvidenceClasses: string;
  /** Evidence items collected for this step */
  evidenceCount: number;
  /** Exception reason if skipped */
  exceptionReason?: string | null;
  exceptionNotes?: string | null;
}

export interface WorkflowForValidation {
  id: string;
  jobType: string;
  experienceLevel: string;
  steps: WorkflowStepForValidation[];
}

// ============================================
// S500:2025 EVIDENCE CLAUSE REFERENCES
// ============================================

const STEP_S500_REFS: Record<string, string> = {
  site_arrival: "S500:2025 §5.2 — Initial response documentation",
  client_authority: "S500:2025 §5.3 — Authority and communication",
  damage_documentation: "S500:2025 §7.1 — Damage assessment documentation",
  environmental_readings: "S500:2025 §7.3 — Psychrometric documentation",
  moisture_mapping: "S500:2025 §10.2 — Moisture mapping requirements",
  affected_area_mapping: "S500:2025 §7.2 — Affected area documentation",
  equipment_deployment: "S500:2025 §12.1 — Equipment documentation",
  scope_documentation: "S500:2025 §11.1 — Scope of work documentation",
  monitoring_review: "S500:2025 §12.4 — Monitoring documentation",
  contamination_assessment: "S500:2025 §3 — Water damage categories",
  mould_assessment: "S500:2025 §8.4 — Mould documentation",
  fire_smoke_assessment: "S500:2025 §15 — Fire and smoke documentation",
};

// ============================================
// CORE VALIDATION
// ============================================

/**
 * Validate a workflow's evidence completeness for submission.
 * Returns detailed blocking/warning gaps.
 */
export function validateWorkflowEvidence(
  workflow: WorkflowForValidation,
): SubmissionValidationResult {
  const blockingGaps: EvidenceGap[] = [];
  const warningGaps: EvidenceGap[] = [];

  let completedSteps = 0;
  let skippedSteps = 0;
  let properlyExceptedSteps = 0;
  let incompleteMandatorySteps = 0;

  for (const step of workflow.steps) {
    const s500Ref = STEP_S500_REFS[step.stepKey];

    // Count by status
    if (step.status === "COMPLETED") {
      completedSteps++;

      // Even completed steps must meet minimum evidence count
      if (step.evidenceCount < step.minimumEvidenceCount) {
        const gap: EvidenceGap = {
          stepKey: step.stepKey,
          stepTitle: step.stepTitle,
          riskTier: step.riskTier,
          issue: "below_minimum",
          detail: `${step.evidenceCount}/${step.minimumEvidenceCount} evidence items captured`,
          s500Ref,
        };

        if (step.isMandatory) {
          blockingGaps.push(gap);
        } else {
          warningGaps.push(gap);
        }
      }
    } else if (step.status === "SKIPPED") {
      skippedSteps++;

      // Skipped steps MUST have an exception reason
      if (!step.exceptionReason) {
        const gap: EvidenceGap = {
          stepKey: step.stepKey,
          stepTitle: step.stepTitle,
          riskTier: step.riskTier,
          issue: "missing_exception_reason",
          detail: "Step was skipped without providing a reason",
          s500Ref,
        };

        if (step.isMandatory) {
          blockingGaps.push(gap);
        } else {
          warningGaps.push(gap);
        }
      } else {
        properlyExceptedSteps++;

        // Mandatory skipped steps are always warnings even with reason
        if (step.isMandatory) {
          warningGaps.push({
            stepKey: step.stepKey,
            stepTitle: step.stepTitle,
            riskTier: step.riskTier,
            issue: "missing_evidence",
            detail: `Mandatory step skipped: ${step.exceptionReason}`,
            s500Ref,
          });
        }
      }
    } else {
      // NOT_STARTED or IN_PROGRESS
      if (step.isMandatory) {
        incompleteMandatorySteps++;
        blockingGaps.push({
          stepKey: step.stepKey,
          stepTitle: step.stepTitle,
          riskTier: step.riskTier,
          issue: "missing_evidence",
          detail: `Mandatory step not completed (status: ${step.status})`,
          s500Ref,
        });
      } else {
        warningGaps.push({
          stepKey: step.stepKey,
          stepTitle: step.stepTitle,
          riskTier: step.riskTier,
          issue: "missing_evidence",
          detail: `Optional step not completed (status: ${step.status})`,
          s500Ref,
        });
      }
    }
  }

  // Calculate score
  const totalSteps = workflow.steps.length;
  const resolvedSteps = completedSteps + properlyExceptedSteps;
  const score =
    totalSteps > 0 ? Math.round((resolvedSteps / totalSteps) * 100) : 0;

  // Can submit only if no blocking gaps
  const canSubmit = blockingGaps.length === 0;

  return {
    canSubmit,
    score,
    blockingGaps,
    warningGaps,
    totalSteps,
    completedSteps,
    skippedSteps,
    properlyExceptedSteps,
    incompleteMandatorySteps,
  };
}

/**
 * Format validation result as a human-readable summary for audit logs.
 */
export function formatValidationSummary(
  result: SubmissionValidationResult,
): string {
  const lines: string[] = [
    `Evidence submission score: ${result.score}%`,
    `Steps: ${result.completedSteps} completed, ${result.skippedSteps} skipped, ${result.incompleteMandatorySteps} mandatory incomplete`,
  ];

  if (result.blockingGaps.length > 0) {
    lines.push(
      `BLOCKING: ${result.blockingGaps.map((g) => `${g.stepTitle} (${g.issue})`).join("; ")}`,
    );
  }

  if (result.warningGaps.length > 0) {
    lines.push(
      `WARNINGS: ${result.warningGaps.map((g) => `${g.stepTitle} (${g.issue})`).join("; ")}`,
    );
  }

  return lines.join(" | ");
}

// ============================================
// QA SCORE INTEGRATION (RA-411)
// ============================================

/**
 * Enrich a submission validation result with evidence quality scoring.
 *
 * If the aggregate QA score is below 70, a blocking gap is added
 * so the inspection cannot be submitted until evidence quality improves.
 *
 * @param result - The existing submission validation result
 * @param inspectionId - The inspection ID for scoring context
 * @param evidenceItems - All evidence items to score
 * @returns Updated result with QA scoring gaps (if any) and the QA result
 */
export function applyQAScoreGate(
  result: SubmissionValidationResult,
  inspectionId: string,
  evidenceItems: EvidenceItemForQA[],
): { validation: SubmissionValidationResult; qaResult: InspectionQAResult } {
  const qaResult = scoreInspectionEvidence(inspectionId, evidenceItems);

  // If no evidence items, skip QA gate (the step-level checks handle missing evidence)
  if (evidenceItems.length === 0) {
    return { validation: result, qaResult };
  }

  // Clone the result to avoid mutating the original
  const updated: SubmissionValidationResult = {
    ...result,
    blockingGaps: [...result.blockingGaps],
    warningGaps: [...result.warningGaps],
  };

  if (qaResult.aggregateScore < 70) {
    updated.blockingGaps.push({
      stepKey: "_qa_score",
      stepTitle: "Evidence Quality Check",
      riskTier: 2,
      issue: "below_minimum",
      detail: `Evidence quality score ${qaResult.aggregateScore}/100 is below the 70-point threshold. Review flagged items.`,
    });
    updated.canSubmit = false;
  } else if (!qaResult.passesGate) {
    // aggregate >= 70 but a mandatory item is below 50
    updated.blockingGaps.push({
      stepKey: "_qa_score",
      stepTitle: "Evidence Quality Check",
      riskTier: 2,
      issue: "below_minimum",
      detail: `One or more mandatory evidence items scored below 50/100. Review and improve flagged items before submission.`,
    });
    updated.canSubmit = false;
  }

  return { validation: updated, qaResult };
}
