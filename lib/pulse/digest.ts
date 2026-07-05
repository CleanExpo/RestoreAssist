/**
 * Restoration Pulse daily digest assembly (RA-6951, epic RA-6948).
 *
 * Builds the "X of Y areas at drying goal" digest content for the daily
 * Pulse cron from the SAME curated projection PR #1777's portal feed uses
 * (lib/portal/drying-timeline.ts) — never raw moisture values. "At goal" is
 * derived from the curated `estimateLabel` (isAreaAtDryingGoal), not from any
 * raw reading or threshold.
 */

import {
  buildDryingTimeline,
  isAreaAtDryingGoal,
  type BuildDryingTimelineInput,
} from "@/lib/portal/drying-timeline";

export interface DailyDigestData {
  areasAtGoal: number;
  totalAreas: number;
  // No visit-scheduling model exists in the codebase yet (checked Inspection,
  // PsychrometricReading.visitDate — a historical per-visit record, not a
  // future schedule). Always null until a scheduling feature lands; the
  // template omits the next-visit line when null.
  nextVisitLabel: string | null;
}

/**
 * Returns null when there is nothing yet to report — no affected area has a
 * moisture reading yet (e.g. a job that has only just started). The cron
 * skips sending a digest for that job rather than emailing a meaningless
 * "0 of 0 areas".
 */
export function buildDailyDigest(
  input: BuildDryingTimelineInput,
): DailyDigestData | null {
  const states = buildDryingTimeline(input);
  if (states.length === 0) return null;

  return {
    areasAtGoal: states.filter(isAreaAtDryingGoal).length,
    totalAreas: states.length,
    nextVisitLabel: null,
  };
}
