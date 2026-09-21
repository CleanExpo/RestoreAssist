/**
 * RA-7622 — the one writer of the `first_report_saved` activation event.
 *
 * "Activated" on Admin → Business counts distinct users with this event, so
 * every path that persists a user's first real, user-authored report calls
 * this once, AFTER the write has succeeded. Sample, demo, seed and copied
 * reports never call it.
 *
 * First-time only. Never blocks or fails the caller: `isFirstTime` returns
 * false on error and `track` is fire-and-forget (RA-1246 contract).
 */

import { track, isFirstTime } from "@/lib/analytics/track";

export async function recordFirstReportSaved(
  userId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  if (await isFirstTime(userId, "first_report_saved")) {
    track(userId, "first_report_saved", properties).catch(() => {});
  }
}
