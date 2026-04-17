// RA-1136a: Make-Safe first-48h compliance gate
// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
//
// Pure function — no side effects. Called by the inspection submit route
// before transitioning status to SUBMITTED/COMPLETED.

import { prisma } from "@/lib/prisma";
import { MAKE_SAFE_ACTIONS } from "@/app/api/inspections/[id]/make-safe/route";

export const MAKE_SAFE_ACTION_LABELS: Record<string, string> = {
  power_isolated: "Power isolated (electrical hazard)",
  gas_isolated: "Gas supply isolated (gas leak hazard)",
  mould_containment: "Mould containment barriers erected",
  water_stopped: "Water source stopped/diverted",
  occupant_briefing: "Occupant safety briefing documented",
};

export type MakeSafeGateResult = {
  canSubmit: boolean;
  blockers: Array<{ action: string; label: string }>;
};

/**
 * Check whether all applicable Make-Safe actions are completed for a given
 * inspection. An action is only a blocker when:
 *   - applicable === true   (N/A items are skipped)
 *   - completed === false   (not yet ticked off)
 *
 * Actions that have no row at all (i.e. never been set) are treated as
 * "applicable + not completed" — this is the safe default.
 */
export async function checkMakeSafeGate(
  inspectionId: string,
): Promise<MakeSafeGateResult> {
  const rows = await prisma.makeSafeAction.findMany({
    where: { inspectionId },
    select: { action: true, applicable: true, completed: true },
    take: 10,
  });

  const rowMap = new Map(rows.map((r) => [r.action, r]));

  const blockers: Array<{ action: string; label: string }> = [];

  for (const action of MAKE_SAFE_ACTIONS) {
    const row = rowMap.get(action);

    if (!row) {
      // Row never created — treat as applicable + incomplete
      blockers.push({ action, label: MAKE_SAFE_ACTION_LABELS[action] ?? action });
      continue;
    }

    if (row.applicable && !row.completed) {
      blockers.push({ action, label: MAKE_SAFE_ACTION_LABELS[action] ?? action });
    }
  }

  return {
    canSubmit: blockers.length === 0,
    blockers,
  };
}
