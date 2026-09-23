// RA-1136a: Make-Safe first-48h compliance gate
// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
//
// Pure function — no side effects. Called by the inspection submit route
// before transitioning status to SUBMITTED/COMPLETED.

import { prisma } from "@/lib/prisma";
import { MAKE_SAFE_ACTIONS } from "@/app/api/inspections/[id]/make-safe/route";
import {
  makeSafeCompliance,
  type MakeSafeComplianceItem,
} from "@/lib/compliance/make-safe-compliance";

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
  /** Plain-English reason when the refusal is not about a specific item. */
  reason?: string;
};

// RA-7739: shown to the technician when nothing was marked applicable.
export const MAKE_SAFE_NOT_ASSESSED_REASON =
  "The Stabilisation checklist has not been filled in. Mark each item as applicable or not applicable, complete the applicable ones, then submit again.";

/**
 * Stabilisation gate per ANSI/IICRC S500:2021.
 * Internal symbol name retained for backward compatibility;
 * user-facing wording is "Stabilisation" per RA-1151.
 *
 * Check whether all applicable stabilisation actions are completed for a given
 * inspection. An action is only a blocker when:
 *   - applicable === true   (N/A items are skipped)
 *   - completed === false   (not yet ticked off)
 *
 * Actions that have no row at all (i.e. never been set) are treated as
 * "applicable + not completed" — this is the safe default.
 *
 * RA-7739: a checklist with nothing applicable (the untouched intake seed,
 * or every item marked N/A) is not an assessment and is refused. Submit is
 * allowed exactly when makeSafeCompliance() — the badge — reads PASS.
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
  const items: MakeSafeComplianceItem[] = [];

  for (const action of MAKE_SAFE_ACTIONS) {
    const row = rowMap.get(action);

    if (!row) {
      // Row never created — treat as applicable + incomplete
      items.push({ applicable: true, completed: false });
      blockers.push({
        action,
        label: MAKE_SAFE_ACTION_LABELS[action] ?? action,
      });
      continue;
    }

    items.push({ applicable: row.applicable, completed: row.completed });
    if (row.applicable && !row.completed) {
      blockers.push({
        action,
        label: MAKE_SAFE_ACTION_LABELS[action] ?? action,
      });
    }
  }

  const status = makeSafeCompliance(items);
  if (status === "NOT_ASSESSED") {
    return { canSubmit: false, blockers, reason: MAKE_SAFE_NOT_ASSESSED_REASON };
  }

  return {
    canSubmit: status === "PASS",
    blockers,
  };
}
