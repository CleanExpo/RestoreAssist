/**
 * RA-6799 AC2 — single source of truth for "may we create a NEW report?".
 *
 * A new report is created only when there is no existing report for the session
 * AND no create is already in flight. This is what makes the report builder
 * idempotent against double-submit / remount / refresh / impatient users, so no
 * orphan reports are ever created from the same session.
 */
export function shouldCreateReport(state: {
  existingReportId: string | null | undefined;
  createInFlight: boolean;
}): boolean {
  return !state.existingReportId && !state.createInFlight;
}
