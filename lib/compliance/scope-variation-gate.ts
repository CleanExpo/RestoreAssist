/**
 * Scope Variation Compliance Gate — RA-1136b
 *
 * Implements ICA Code of Practice §5 + Insurance Contracts Act 1984 (AU).
 * Blocks inspection submission when any scope variation is still PENDING approval.
 *
 * Distinct from the invoice-line-item variations system (/api/invoices/[id]/variations/).
 * This gate operates on ScopeVariation records tied to an Inspection.
 */

import { prisma } from "@/lib/prisma";

export type ScopeVariationGateResult = {
  canSubmit: boolean;
  pendingCount: number;
  blockers: string[];
};

export async function checkScopeVariationGate(
  inspectionId: string,
): Promise<ScopeVariationGateResult> {
  const pending = await prisma.scopeVariation.findMany({
    where: { inspectionId, status: "PENDING" },
    select: { id: true, reason: true, costDeltaCents: true },
    take: 50,
  });

  return {
    canSubmit: pending.length === 0,
    pendingCount: pending.length,
    blockers: pending.map(
      (v) =>
        `Variation pending approval: ${v.reason} (delta: $${(v.costDeltaCents / 100).toFixed(2)})`,
    ),
  };
}
