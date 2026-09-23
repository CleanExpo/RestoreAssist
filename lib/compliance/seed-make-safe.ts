/**
 * Seed Stabilisation (make-safe) rows for an inspection when none exist.
 *
 * The submit gate treats missing rows as incomplete blockers. The new-inspection
 * intake form historically never created these rows, so every submit 422'd.
 * Seeding N/A placeholders gives the checklist rows to edit. Since RA-7739 an
 * all-N/A checklist is refused at submit ("not assessed"), so the technician
 * must mark and complete at least one applicable item before submitting.
 */

import { prisma } from "@/lib/prisma";
import { MAKE_SAFE_ACTIONS } from "@/app/api/inspections/[id]/make-safe/route";
import { MAKE_SAFE_SEED_NOTE as SEED_NOTE } from "@/lib/compliance/make-safe-compliance";

/**
 * Idempotent: only inserts when the inspection has zero MakeSafeAction rows.
 * Returns true when rows were created.
 */
export async function ensureMakeSafeSeeded(
  inspectionId: string,
): Promise<boolean> {
  const existing = await prisma.makeSafeAction.count({
    where: { inspectionId },
  });
  if (existing > 0) return false;

  await prisma.makeSafeAction.createMany({
    data: MAKE_SAFE_ACTIONS.map((action) => ({
      inspectionId,
      action,
      applicable: false,
      completed: false,
      notes: SEED_NOTE,
    })),
    skipDuplicates: true,
  });

  return true;
}
