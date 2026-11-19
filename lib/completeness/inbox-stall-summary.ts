/**
 * Wave 5 (W5-1) — aggregate completeness inbox into stall metrics (RA-8184).
 */

import { inboxAgeingBand, type InboxAgeingBand } from "./inbox-ageing";
import type { CompletenessInboxRow } from "./org-inbox";

export type InboxStallSummary = {
  totalStalled: number;
  byBlocker: Record<string, number>;
  byAge: Record<InboxAgeingBand, number>;
  maxDaysIdle: number;
};

export function summarizeInboxStalls(
  rows: readonly CompletenessInboxRow[],
): InboxStallSummary {
  const byBlocker: Record<string, number> = {};
  const byAge: Record<InboxAgeingBand, number> = {
    fresh: 0,
    ageing: 0,
    stale: 0,
  };

  for (const row of rows) {
    for (const blocker of row.blocking) {
      byBlocker[blocker] = (byBlocker[blocker] ?? 0) + 1;
    }
    byAge[inboxAgeingBand(row.daysIdle)] += 1;
  }

  const maxDaysIdle =
    rows.length > 0 ? Math.max(...rows.map((r) => r.daysIdle)) : 0;

  return {
    totalStalled: rows.length,
    byBlocker,
    byAge,
    maxDaysIdle,
  };
}