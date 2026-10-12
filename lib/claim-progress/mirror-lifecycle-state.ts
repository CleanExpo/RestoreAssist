/**
 * P2 / V1 P1-7 — lifecycle mirrors must use ClaimProgress.version CAS,
 * not blind updateMany without version checks.
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
): Promise<{ version: number }> {
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
    throw new ClaimProgressMirrorConflict("ClaimProgress row missing");
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
