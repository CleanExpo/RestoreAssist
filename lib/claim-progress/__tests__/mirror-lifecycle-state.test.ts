import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  ClaimProgressMirrorConflict,
  mirrorClaimProgressLifecycleState,
} from "../mirror-lifecycle-state";

function tx(row: { id: string; version: number } | null, updatedCount = 1) {
  const findFirst = vi.fn(async () => row);
  const updateMany = vi.fn(async () => ({ count: updatedCount }));
  return {
    client: { claimProgress: { findFirst, updateMany } } as unknown as Prisma.TransactionClient,
    findFirst,
    updateMany,
  };
}

const args = {
  inspectionId: "insp-1",
  previousState: "CLOSEOUT",
  currentState: "INVOICE_ISSUED",
} as const;

describe("mirrorClaimProgressLifecycleState", () => {
  it("is a no-op when the job has no ClaimProgress row (progress never started)", async () => {
    const t = tx(null);
    await expect(mirrorClaimProgressLifecycleState(t.client, args)).resolves.toEqual({ version: null });
    expect(t.updateMany).not.toHaveBeenCalled();
  });

  it("advances an existing row only at the version it read (CAS)", async () => {
    const t = tx({ id: "cp-1", version: 4 });
    await expect(mirrorClaimProgressLifecycleState(t.client, args)).resolves.toEqual({ version: 5 });
    expect(t.updateMany).toHaveBeenCalledWith({
      where: { id: "cp-1", version: 4 },
      data: expect.objectContaining({
        previousState: "CLOSEOUT",
        currentState: "INVOICE_ISSUED",
        version: { increment: 1 },
      }),
    });
  });

  it("refuses when the row moved underneath (version drift)", async () => {
    const t = tx({ id: "cp-1", version: 4 }, 0);
    await expect(mirrorClaimProgressLifecycleState(t.client, args)).rejects.toBeInstanceOf(
      ClaimProgressMirrorConflict,
    );
  });
});
