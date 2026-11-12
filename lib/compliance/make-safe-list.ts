/**
 * RA-8327 — the server side of the make-safe list decision.
 *
 * decideMakeSafeList and judgeMakeSafe (make-safe-actions.ts) own the rules.
 * This file only gathers what they need from the database: the rows with
 * their notes, the claim type when the caller has not read it, and, when the
 * claim type is blank, whether the job has a fire assessment. The gate, the
 * intake seed, the make-safe route, the stabilisation attestation, the
 * adjuster review and the report gaps check all call it. A structural test
 * (make-safe-readers.ra8327.test.ts) keeps every other module from reading
 * make-safe rows to judge completion.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  decideMakeSafeList,
  isBlankClaimType,
  judgeMakeSafe,
  type MakeSafeCompletion,
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

/** The tables this module reads. Guards pass their own client. */
export type MakeSafeDb = Pick<
  PrismaClient,
  "makeSafeAction" | "inspection" | "fireSmokeDamageAssessment"
>;

/** True when the job has a fire and smoke damage assessment. */
async function hasFireAssessment(
  inspectionId: string,
  db: Pick<MakeSafeDb, "fireSmokeDamageAssessment">,
): Promise<boolean> {
  const assessment = await db.fireSmokeDamageAssessment.findFirst({
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
  db: Pick<MakeSafeDb, "fireSmokeDamageAssessment"> = prisma,
): Promise<MakeSafeListDecision<R>> {
  const fireAssessment = isBlankClaimType(claimType)
    ? await hasFireAssessment(inspectionId, db)
    : false;
  return decideMakeSafeList({
    claimType,
    hasFireAssessment: fireAssessment,
    rows,
  });
}

/**
 * Load this job's make-safe rows and judge completion on the job's own list.
 * Pass `claimType` when the caller already read it; otherwise it is read here.
 */
export async function loadMakeSafeCompletion(
  inspectionId: string,
  opts: { claimType?: string | null; db?: MakeSafeDb } = {},
): Promise<MakeSafeCompletion> {
  const db = opts.db ?? prisma;
  const [rows, claimType] = await Promise.all([
    db.makeSafeAction.findMany({
      where: { inspectionId },
      select: MAKE_SAFE_DECISION_SELECT,
      // A small closed set (at most both lists); the bound never truncates.
      // Even if it did, a dropped row reads as open, so the judgement fails
      // closed; open rows still come first.
      orderBy: { completed: "asc" },
      take: 50,
    }),
    "claimType" in opts
      ? Promise.resolve(opts.claimType)
      : db.inspection
          .findUnique({ where: { id: inspectionId }, select: { claimType: true } })
          .then((i) => i?.claimType ?? null),
  ]);
  const fireAssessment = isBlankClaimType(claimType)
    ? await hasFireAssessment(inspectionId, db)
    : false;
  return judgeMakeSafe({ claimType, hasFireAssessment: fireAssessment, rows });
}
