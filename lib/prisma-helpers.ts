/**
 * RA-1551 — "swallow only P2025" helper.
 *
 * Many delete-orphan code paths run `delete({ where: { ... } })
 * .catch(() => {})` because the caller is happy if the row is already
 * gone (idempotent cleanup). The problem: that swallow also hides
 * real errors — DB outage, permission error, malformed where clause.
 * PM Round 2 flagged this as a silent-failure risk.
 *
 * `softDelete` narrows the swallow to Prisma's "record not found" code
 * (P2025); any other error is re-thrown so the outer handler surfaces
 * it to the user via `fromException`.
 */

import { reportError } from "@/lib/observability";

function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2025"
  );
}

/**
 * Run an idempotent delete. If Prisma says the record is already gone
 * (P2025) resolve quietly; anything else is logged + re-thrown so the
 * caller's try/catch sees it.
 */
export async function softDelete<T>(
  fn: () => Promise<T>,
  context: { route: string; stage?: string; [k: string]: unknown },
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isRecordNotFound(err)) return null;
    reportError(err, context);
    throw err;
  }
}
