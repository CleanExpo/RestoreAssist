/**
 * RA-8327 — the server side of the make-safe list decision.
 *
 * decideMakeSafeList (make-safe-actions.ts) owns the rule. This file only
 * gathers what the rule needs from the database: the rows with their notes,
 * and, when the claim type is blank, whether the job has a fire
 * assessment. The gate, the intake seed and the make-safe route all call it.
 */
import { prisma } from "@/lib/prisma";
import {
  decideMakeSafeList,
  isBlankClaimType,
  type MakeSafeListDecision,
  type StoredMakeSafeRow,
} from "@/lib/compliance/make-safe-actions";

/** The columns the decision reads. Every caller loads rows with these. */
export const MAKE_SAFE_DECISION_SELECT = {
  action: true,
  applicable: true,
  completed: true,
  notes: true,
} as const;

/** True when the job has a fire and smoke damage assessment. */
async function hasFireAssessment(inspectionId: string): Promise<boolean> {
  const assessment = await prisma.fireSmokeDamageAssessment.findFirst({
    where: { inspectionId },
    select: { id: true },
  });
  return assessment != null;
}

/**
 * Decide this job's list. The fire assessment is looked up only when the
 * claim type is blank, which is the only case it changes.
 */
export async function decideMakeSafeListForInspection<
  R extends StoredMakeSafeRow,
>(
  inspectionId: string,
  claimType: string | null | undefined,
  rows: readonly R[],
): Promise<MakeSafeListDecision<R>> {
  const fireAssessment = isBlankClaimType(claimType)
    ? await hasFireAssessment(inspectionId)
    : false;
  return decideMakeSafeList({
    claimType,
    hasFireAssessment: fireAssessment,
    rows,
  });
}
