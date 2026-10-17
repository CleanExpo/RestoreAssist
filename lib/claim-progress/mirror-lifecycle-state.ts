/**
 * P2 / V1 P1-7 — lifecycle mirrors must use ClaimProgress.version CAS,
 * not blind updateMany without version checks.
 *
 * A ClaimProgress row exists only once someone starts claim progress (or the
 * backfill cron reaches the job), so an inspection without one is normal. The
 * blind updateMany this replaced was a no-op for such an inspection; the CAS
 * version must be too, or invoice, close and reopen answer 500 for every job
 * whose progress was never started. Version drift on a row that does exist
 * still throws.
 */

import type { Prisma, ClaimState } from "@prisma/client";

export class ClaimProgressMirrorConflict extends Error {
  constructor(message = "ClaimProgress version drift") {
    super(message);
    this.name = "ClaimProgressMirrorConflict";
  }
}

export async function mirrorClaimProgressLifecycleState(
  tx: Prisma.TransactionClient,
  args: {
    inspectionId: string;
    childInspectionFilter?: Prisma.InspectionWhereInput;
    previousState: ClaimState;
    currentState: ClaimState;
    closedAt?: Date | null;
  },
): Promise<{ version: number | null }> {
  const row = await tx.claimProgress.findFirst({
    where: {
      inspectionId: args.inspectionId,
      ...(args.childInspectionFilter && {
        inspection: args.childInspectionFilter,
      }),
    },
    select: { id: true, version: true },
  });
  if (!row) {
    // Nothing to mirror: progress tracking was never started for this job.
    return { version: null };
  }

  const updated = await tx.claimProgress.updateMany({
    where: { id: row.id, version: row.version },
    data: {
      previousState: args.previousState,
      currentState: args.currentState,
      version: { increment: 1 },
      ...(args.closedAt !== undefined ? { closedAt: args.closedAt } : {}),
    },
  });
  if (updated.count === 0) {
    throw new ClaimProgressMirrorConflict();
  }
  return { version: row.version + 1 };
}
