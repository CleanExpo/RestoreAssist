/**
 * Submission Gate Validation — RA-401
 *
 * Validates whether an inspection has captured all required evidence
 * before it can be submitted. Compares captured EvidenceItem records
 * against the workflow requirements for the claim type.
 *
 * @see lib/evidence/index.ts — getSubmissionGateRequirements()
 * @see lib/evidence/workflow-definitions.ts — Phase and rule definitions
 */

import { prisma } from "@/lib/prisma";
import {
  getSubmissionGateRequirements,
  getWorkflowForClaimType,
  EVIDENCE_CLASSES,
} from "@/lib/evidence";
import type { EvidenceClass } from "@prisma/client";

export interface ValidationGap {
  evidenceClass: EvidenceClass;
  displayName: string;
  phase: string;
  required: number;
  captured: number;
  guidance: string;
}

export interface SubmissionValidation {
  passed: boolean;
  completionPercentage: number;
  totalRequired: number;
  totalCaptured: number;
  gaps: ValidationGap[];
  warnings: string[];
}

/**
 * Build a map of evidenceClass → phase displayName by walking the workflow.
 * When an evidence class appears in multiple phases, we use the first
 * phase that lists it as required (matching submission-gate order).
 */
function buildPhaseMap(claimType: string): Map<EvidenceClass, string> {
  const phaseMap = new Map<EvidenceClass, string>();
  const workflow = getWorkflowForClaimType(claimType);
  if (!workflow) return phaseMap;

  for (const phase of workflow.phases) {
    for (const rule of phase.evidenceRules) {
      if (
        rule.requirement === "required" &&
        !phaseMap.has(rule.evidenceClass)
      ) {
        phaseMap.set(rule.evidenceClass, phase.displayName);
      }
    }
  }

  return phaseMap;
}

/**
 * Validate whether an inspection has captured all required evidence
 * for submission according to the claim type's workflow rules.
 *
 * @param inspectionId - The inspection to validate
 * @param claimType - The claim type workflow to validate against
 * @returns Structured validation result with gaps and warnings
 */
export async function validateSubmission(
  inspectionId: string,
  claimType: string,
): Promise<SubmissionValidation> {
  // 1. Get all evidence items for this inspection
  const evidenceItems = await prisma.evidenceItem.findMany({
    where: { inspectionId },
    select: { evidenceClass: true, status: true },
  });

  // 2. Get submission gate requirements (all "required" rules across phases)
  const requirements = getSubmissionGateRequirements(claimType);

  // 3. Build phase display name lookup
  const phaseMap = buildPhaseMap(claimType);

  // 4. Count captured evidence by class (only non-rejected items count)
  const capturedCounts = new Map<EvidenceClass, number>();
  for (const item of evidenceItems) {
    if (item.status === "REJECTED") continue;
    const current = capturedCounts.get(item.evidenceClass) || 0;
    capturedCounts.set(item.evidenceClass, current + 1);
  }

  // 5. Find gaps where captured < required
  const gaps: ValidationGap[] = [];
  let totalRequired = 0;
  let totalCaptured = 0;

  for (const req of requirements) {
    const captured = capturedCounts.get(req.evidenceClass) || 0;
    totalRequired += req.minCount;
    totalCaptured += Math.min(captured, req.minCount);

    if (captured < req.minCount) {
      const meta = EVIDENCE_CLASSES[req.evidenceClass];
      gaps.push({
        evidenceClass: req.evidenceClass,
        displayName: meta.displayName,
        phase: phaseMap.get(req.evidenceClass) ?? "Unknown",
        required: req.minCount,
        captured,
        guidance: req.guidance,
      });
    }
  }

  // 6. Warnings (non-blocking issues)
  const warnings: string[] = [];
  const flaggedItems = evidenceItems.filter((i) => i.status === "FLAGGED");
  if (flaggedItems.length > 0) {
    warnings.push(`${flaggedItems.length} evidence item(s) flagged for review`);
  }
  const rejectedItems = evidenceItems.filter((i) => i.status === "REJECTED");
  if (rejectedItems.length > 0) {
    warnings.push(
      `${rejectedItems.length} evidence item(s) rejected — may need replacement`,
    );
  }

  const completionPercentage =
    totalRequired > 0 ? Math.round((totalCaptured / totalRequired) * 100) : 100;

  return {
    passed: gaps.length === 0,
    completionPercentage,
    totalRequired,
    totalCaptured,
    gaps,
    warnings,
  };
}
