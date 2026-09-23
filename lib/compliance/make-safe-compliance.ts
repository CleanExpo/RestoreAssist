/**
 * RA-7713 part 10 — derived Stabilisation (make-safe) compliance status.
 *
 * Pure, display-only. The intake seed (lib/compliance/seed-make-safe.ts)
 * writes every action as N/A so submit is not blocked, and the checklist used
 * to read "every applicable item complete" as PASS — true of an empty set, so
 * an untouched seed showed "Compliance: PASS". PASS now needs at least one
 * applicable item, all of them complete.
 *
 * This does not change the submit gate (lib/compliance/make-safe-gate.ts) and
 * needs no schema change.
 */

export const MAKE_SAFE_SEED_NOTE =
  "Seeded at intake — mark applicable items complete before relying on this for compliance.";

export type MakeSafeCompliance = "PASS" | "FAIL" | "NOT_ASSESSED";

export interface MakeSafeComplianceItem {
  applicable: boolean;
  completed: boolean;
  notes?: string | null;
}

export function makeSafeCompliance(
  items: readonly MakeSafeComplianceItem[],
): MakeSafeCompliance {
  // All-N/A (which includes the untouched intake seed) is not an assessment.
  const applicable = items.filter((i) => i.applicable);
  if (applicable.length === 0) return "NOT_ASSESSED";
  return applicable.every((i) => i.completed) ? "PASS" : "FAIL";
}

export const MAKE_SAFE_COMPLIANCE_LABEL: Record<MakeSafeCompliance, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_ASSESSED: "Not assessed",
};
