/**
 * Weakness-detection orchestrator (RA-5041 PR1 — deterministic layer only).
 *
 * Runs every deterministic check synchronously against a structured report
 * and returns both the findings and a list of sections/candidates that still
 * need the LLM-judged contradiction pass (PR2 — not implemented here, zero
 * AI spend in this PR).
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

import { checkCategorySeparation } from "./category-separation";
import { checkFieldCompleteness } from "./field-completeness";
import { checkRedlineLanguage } from "./redline-language";
import { checkScopeExpansion } from "./scope-expansion";
import type {
  ReportSectionId,
  WeaknessDetectionInput,
  WeaknessFinding,
} from "./types";

export * from "./types";
export { checkRedlineLanguage } from "./redline-language";
export { checkFieldCompleteness } from "./field-completeness";
export { checkCategorySeparation } from "./category-separation";
export { checkScopeExpansion } from "./scope-expansion";

export interface PendingLlmReview {
  reportSectionId: ReportSectionId;
  reason: string;
}

export interface WeaknessDetectionResult {
  findings: WeaknessFinding[];
  /** Sections/candidates deferred to the PR2 LLM contradiction pass. */
  pendingLlmReview: PendingLlmReview[];
}

function buildPendingLlmReview(
  input: WeaknessDetectionInput,
  findings: WeaknessFinding[],
): PendingLlmReview[] {
  const pending: PendingLlmReview[] = [];

  // Contradiction detection across summary/technician-notes/photos/
  // recommendations is not attempted deterministically — flag it whenever
  // there is more than one narrative surface present to cross-check.
  const narrativeSections: ReportSectionId[] = [];
  if (input.technicianNotes) narrativeSections.push("technicianNotes");
  if ((input.recommendations?.length ?? 0) > 0) narrativeSections.push("recommendations");
  if ((input.photos?.length ?? 0) > 0) narrativeSections.push("photos");

  if (narrativeSections.length > 1) {
    for (const reportSectionId of narrativeSections) {
      pending.push({
        reportSectionId,
        reason:
          "Contradiction detection between this section and the report's other narrative sections is LLM-judged (PR2) — deterministic layer does not compare free text.",
      });
    }
  }

  // Every unsupported_causation candidate from the term-list scan needs LLM
  // adjudication against evidence fields before it can be resolved (PR2).
  for (const finding of findings) {
    if (finding.checkClass === "unsupported_causation") {
      const reportSectionId =
        typeof finding.evidenceAnchor === "string"
          ? "technicianNotes"
          : finding.evidenceAnchor.reportSectionId;
      pending.push({
        reportSectionId,
        reason: `Causation candidate ("${finding.description}") needs LLM adjudication against evidence fields (PR2).`,
      });
    }
  }

  return pending;
}

export function runDeterministicWeaknessChecks(
  input: WeaknessDetectionInput,
): WeaknessDetectionResult {
  const findings: WeaknessFinding[] = [
    ...checkRedlineLanguage(input),
    ...checkFieldCompleteness(input),
    ...checkCategorySeparation(input),
    ...checkScopeExpansion(input),
  ];

  return {
    findings,
    pendingLlmReview: buildPendingLlmReview(input, findings),
  };
}
