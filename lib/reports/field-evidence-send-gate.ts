/**
 * RA-8184 / S5-1 — refuse client report email when required field evidence
 * is still missing on the linked job. Uses the same checklist as capture
 * (field-evidence-audit); does not apply dashboard completeness or AI gates.
 */

import type { FieldEvidenceChecklist } from "@/lib/evidence/field-evidence-checklist";

export function requiredFieldEvidenceGapCount(
  checklist: FieldEvidenceChecklist,
): number {
  return checklist.categories.required.filter((i) => i.status === "missing")
    .length;
}

export function blocksReportSendForFieldEvidence(
  checklist: FieldEvidenceChecklist,
): boolean {
  return requiredFieldEvidenceGapCount(checklist) > 0;
}

export const FIELD_EVIDENCE_SEND_REFUSAL_MESSAGE =
  "Required field evidence is still missing on the linked job. Finish capture on site, then send the report again.";
