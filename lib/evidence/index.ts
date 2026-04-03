/**
 * Evidence Workflow Utilities — RA-398
 *
 * Public API for the evidence workflow system. Consumed by:
 *   - RA-399: Guided capture workflow engine (UI)
 *   - RA-401: Submission gate validation
 *   - RA-402: Admin missing evidence dashboard
 *
 * @example
 *   import { getWorkflowForClaimType, getRequiredEvidenceForPhase } from "@/lib/evidence";
 *
 *   const workflow = getWorkflowForClaimType("water_damage");
 *   const required = getRequiredEvidenceForPhase("water_damage", "on_site_initial");
 */

export {
  EVIDENCE_CLASSES,
  getEvidenceClassMeta,
  getMeasurementClasses,
} from "./evidence-classes";

export type { EvidenceClassMeta } from "./evidence-classes";

export { WORKFLOWS } from "./workflow-definitions";

export type {
  ClaimType,
  InspectionPhase,
  EvidenceRequirement,
  PhaseEvidenceRule,
  WorkflowPhase,
  ClaimWorkflow,
} from "./workflow-definitions";

import type { EvidenceClass } from "@prisma/client";
import { WORKFLOWS } from "./workflow-definitions";
import type {
  ClaimType,
  InspectionPhase,
  ClaimWorkflow,
  PhaseEvidenceRule,
  WorkflowPhase,
} from "./workflow-definitions";

/**
 * Get the full workflow definition for a claim type.
 * Returns undefined if claim type is not recognised.
 */
export function getWorkflowForClaimType(
  claimType: string,
): ClaimWorkflow | undefined {
  return WORKFLOWS[claimType as ClaimType];
}

/**
 * Get the evidence rules for a specific phase within a claim type.
 * Returns an empty array if the claim type or phase is not found.
 */
export function getRequiredEvidenceForPhase(
  claimType: string,
  phase: InspectionPhase,
): PhaseEvidenceRule[] {
  const workflow = WORKFLOWS[claimType as ClaimType];
  if (!workflow) return [];

  const phaseConfig = workflow.phases.find((p) => p.phase === phase);
  return phaseConfig?.evidenceRules ?? [];
}

/**
 * Get the submission gate requirements for a claim type.
 * Returns all "required" evidence rules across all phases — the minimum
 * evidence that must be captured before an inspection can be submitted.
 */
export function getSubmissionGateRequirements(
  claimType: string,
): PhaseEvidenceRule[] {
  const workflow = WORKFLOWS[claimType as ClaimType];
  if (!workflow) return [];

  return workflow.phases.flatMap((phase) =>
    phase.evidenceRules.filter((rule) => rule.requirement === "required"),
  );
}

/**
 * Get all phases for a claim type with their display metadata.
 */
export function getPhasesForClaimType(claimType: string): WorkflowPhase[] {
  const workflow = WORKFLOWS[claimType as ClaimType];
  return workflow?.phases ?? [];
}

/**
 * Check whether a specific evidence class is required for a claim type
 * in any phase.
 */
export function isEvidenceRequired(
  claimType: string,
  evidenceClass: EvidenceClass,
): boolean {
  const requirements = getSubmissionGateRequirements(claimType);
  return requirements.some((r) => r.evidenceClass === evidenceClass);
}

/**
 * Get the total minimum evidence count required for submission.
 * Useful for progress indicators: "12 of 24 required items captured".
 */
export function getTotalRequiredCount(claimType: string): number {
  const requirements = getSubmissionGateRequirements(claimType);
  return requirements.reduce((sum, r) => sum + r.minCount, 0);
}

/** All supported claim types */
export const SUPPORTED_CLAIM_TYPES: ClaimType[] = [
  "water_damage",
  "fire_smoke",
  "mould",
  "storm",
  "sewage",
];
