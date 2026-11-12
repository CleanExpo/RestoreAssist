/**
 * Seed Stabilisation (make-safe) rows for an inspection when none exist.
 *
 * The submit gate treats missing rows as incomplete blockers. The new-inspection
 * intake form historically never created these rows, so every submit 422'd.
 * Seeding N/A placeholders gives the checklist rows to edit. Since RA-7739 an
 * all-N/A checklist is refused at submit ("not assessed"), so the technician
 * must mark and complete at least one applicable item before submitting.
 *
 * RA-8327: the rows seeded are the job's list (makeSafeListKindFor): the fire
 * list on a fire job, the standard list otherwise. Existing rows are never
 * changed or removed.
 */

import { prisma } from "@/lib/prisma";
import {
  hasRowUniqueTo,
  makeSafeActionsFor,
  makeSafeListKindFor,
} from "@/lib/compliance/make-safe-actions";
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
 * Idempotent. With no rows, seeds the job's list. With rows, and a claim type
 * given, adds the missing rows of the job's list only when the rows are the
 * other list's seed: a fire job that still holds the untouched standard
 * intake seed. Any other partly filled list is left as it is, so a missing
 * row still blocks submit exactly as before.
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
    const kind = makeSafeListKindFor({ claimType });
    await prisma.makeSafeAction.createMany({
      data: seedRows(inspectionId, makeSafeActionsFor(kind)),
      skipDuplicates: true,
    });
    return true;
  }
  if (claimType == null) return false;

  const rows = await prisma.makeSafeAction.findMany({
    where: { inspectionId },
    select: { action: true, applicable: true, completed: true },
    take: 20,
  });
  const kind = makeSafeListKindFor({ claimType, rows });
  const other = kind === "fire" ? "standard" : "fire";
  // Only the seed of the other list (left behind when the claim type changed
  // before anything was recorded) is topped up. A partly filled list of this
  // job's own kind is left alone, so its missing rows still block submit.
  if (hasRowUniqueTo(kind, rows) || !hasRowUniqueTo(other, rows)) return false;

  const have = new Set(rows.map((r) => r.action));
  const missing = makeSafeActionsFor(kind).filter((a) => !have.has(a));
  if (missing.length === 0) return false;
  await prisma.makeSafeAction.createMany({
    data: seedRows(inspectionId, missing),
    skipDuplicates: true,
  });
  return true;
}
