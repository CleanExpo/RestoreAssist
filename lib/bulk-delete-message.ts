/**
 * Pure, dependency-free helpers for itemising bulk-delete failures in the UI.
 *
 * Split out of `app/dashboard/invoices/page.tsx` so the failure-message logic is
 * unit-testable without rendering the page (and so this file never pulls a
 * server-only import into the client bundle — unlike `lib/bulk-operations.ts`).
 */

type SettledOk = PromiseSettledResult<{ ok: boolean }>;

/** True when a settled DELETE result represents a failure (rejected or non-2xx). */
function isFailed(result: SettledOk): boolean {
  return result.status === "rejected" || !result.value.ok;
}

/**
 * Map the failed entries of a `Promise.allSettled` batch back to human labels.
 * `ids` and `results` must be index-aligned (same order as dispatched).
 */
export function collectFailedLabels(
  ids: string[],
  results: SettledOk[],
  labelFor: (id: string) => string,
): string[] {
  const labels: string[] = [];
  results.forEach((result, i) => {
    if (isFailed(result)) labels.push(labelFor(ids[i]));
  });
  return labels;
}

/**
 * Build a user-facing error message naming which invoices failed to delete.
 * Caps the named list at `max` (default 5), appending "and N more".
 */
export function formatDeleteFailureMessage(
  failedLabels: string[],
  max = 5,
): string {
  if (failedLabels.length === 0) return "";
  if (failedLabels.length === 1) {
    return `Failed to delete invoice ${failedLabels[0]}.`;
  }
  const shown = failedLabels.slice(0, max);
  const remaining = failedLabels.length - shown.length;
  const tail = remaining > 0 ? ` and ${remaining} more` : "";
  return `Failed to delete ${failedLabels.length} invoices: ${shown.join(", ")}${tail}.`;
}
