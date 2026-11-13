/**
 * Seed Stabilisation (make-safe) rows for an inspection when none exist.
 *
 * The submit gate treats missing rows as incomplete blockers. The new-inspection
 * intake form historically never created these rows, so every submit 422'd.
 * Seeding N/A placeholders gives the checklist rows to edit. Since RA-7739 an
 * all-N/A checklist is refused at submit ("not assessed"), so the technician
 * must mark and complete at least one applicable item before submitting.
 *
 * RA-8327: the rows seeded are the job's list (decideMakeSafeList): the fire
 * list on a fire job, the standard list otherwise. Existing rows are never
 * changed or removed.
 */

import { prisma } from "@/lib/prisma";
import { isIntakeSeed } from "@/lib/compliance/make-safe-actions";
import {
  decideMakeSafeListForInspection,
  MAKE_SAFE_DECISION_SELECT,
} from "@/lib/compliance/make-safe-list";
import { MAKE_SAFE_SEED_NOTE as SEED_NOTE } from "@/lib/compliance/make-safe-compliance";

function seedRows(inspectionId: string, actions: readonly string[]) {
  return actions.map((action) => ({
    inspectionId,
    action,
    applicable: false,
    completed: false,
    notes: SEED_NOTE,
  }));
}

/**
 * Idempotent. With no rows, seeds the job's list. With rows, adds the missing
 * rows of the job's list only while every stored row is still the untouched
 * intake seed (isIntakeSeed): for example a fire job that holds only the
 * standard seed because the claim type was set after intake. Once a person
 * has recorded anything, nothing is added, so a missing row still blocks
 * submit exactly as before.
 * Returns true when rows were created.
 */
export async function ensureMakeSafeSeeded(
  inspectionId: string,
  claimType?: string | null,
): Promise<boolean> {
  const existing = await prisma.makeSafeAction.count({
    where: { inspectionId },
  });
  if (existing === 0) {
    const { actions } = await decideMakeSafeListForInspection(
      inspectionId,
      claimType,
      [],
    );
    await prisma.makeSafeAction.createMany({
      data: seedRows(inspectionId, actions),
      skipDuplicates: true,
    });
    return true;
  }

  const rows = await prisma.makeSafeAction.findMany({
    where: { inspectionId },
    select: MAKE_SAFE_DECISION_SELECT,
    take: 20,
  });
  if (!isIntakeSeed(rows)) return false;

  const { actions } = await decideMakeSafeListForInspection(
    inspectionId,
    claimType,
    rows,
  );
  const have = new Set(rows.map((r) => r.action));
  const missing = actions.filter((a) => !have.has(a));
  if (missing.length === 0) return false;
  await prisma.makeSafeAction.createMany({
    data: seedRows(inspectionId, missing),
    skipDuplicates: true,
  });
  return true;
}
