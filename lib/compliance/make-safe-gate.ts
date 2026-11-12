// RA-1136a: Make-Safe first-48h compliance gate
// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
//
// Pure function — no side effects. Called by the inspection submit route
// before transitioning status to SUBMITTED/COMPLETED.

import { prisma } from "@/lib/prisma";
import {
  MAKE_SAFE_ACTION_LABELS as LABELS,
  makeSafeActionsFor,
  makeSafeListKindFor,
} from "@/lib/compliance/make-safe-actions";
import {
  makeSafeCompliance,
  MAKE_SAFE_NOT_ASSESSED_REASON,
  type MakeSafeComplianceItem,
} from "@/lib/compliance/make-safe-compliance";

/** Labels live in make-safe-actions.ts; re-exported for existing importers. */
export const MAKE_SAFE_ACTION_LABELS: Record<string, string> = LABELS;

export type MakeSafeGateResult = {
  canSubmit: boolean;
  blockers: Array<{ action: string; label: string }>;
  /** Plain-English reason when the refusal is not about a specific item. */
  reason?: string;
};

export { MAKE_SAFE_NOT_ASSESSED_REASON };

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
 *
 * RA-8327: the list checked is the job's list (makeSafeListKindFor). Fire
 * jobs are checked against the fire list, every other job against the
 * standard list exactly as before. Rows for the other list are ignored, never
 * deleted. Pass the inspection's claimType; without it the stored rows name
 * the list, and a job with none is checked against the standard list.
 */
export async function checkMakeSafeGate(
  inspectionId: string,
  claimType?: string | null,
): Promise<MakeSafeGateResult> {
  const rows = await prisma.makeSafeAction.findMany({
    where: { inspectionId },
    select: { action: true, applicable: true, completed: true },
    take: 10,
  });

  const rowMap = new Map(rows.map((r) => [r.action, r]));
  const actions = makeSafeActionsFor(makeSafeListKindFor({ claimType, rows }));

  const blockers: Array<{ action: string; label: string }> = [];
  const items: MakeSafeComplianceItem[] = [];

  for (const action of actions) {
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
