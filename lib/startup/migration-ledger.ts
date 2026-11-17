/**
 * One owner for "which migrations count as applied" (RA-7942).
 *
 * Both /api/health/migrations and the boot guard read `_prisma_migrations`
 * and must agree, so the rule lives here and both call it.
 *
 * A migration name is:
 *   failed          when any attempt neither finished nor was rolled back
 *   applied         when no attempt is unresolved and one finished without
 *                   being rolled back
 *   rolledBackOnly  otherwise
 */
export interface MigrationAttempt {
  migration_name: string;
  finished_at: Date | string | null;
  rolled_back_at: Date | string | null;
}

export interface ClassifiedLedger {
  applied: string[];
  failed: string[];
  rolledBackOnly: string[];
  /** Distinct migration names seen, in any state. */
  total: number;
}

export function classifyMigrationLedger(
  rows: readonly MigrationAttempt[],
): ClassifiedLedger {
  const attemptsByName = new Map<string, MigrationAttempt[]>();
  for (const row of rows) {
    const attempts = attemptsByName.get(row.migration_name) ?? [];
    attempts.push(row);
    attemptsByName.set(row.migration_name, attempts);
  }

  const failed: string[] = [];
  const rolledBackOnly: string[] = [];
  const applied: string[] = [];
  for (const [name, attempts] of attemptsByName) {
    const hasUnresolvedAttempt = attempts.some(
      (attempt) =>
        attempt.finished_at === null && attempt.rolled_back_at === null,
    );
    const hasSuccessfulAttempt = attempts.some(
      (attempt) =>
        attempt.finished_at !== null && attempt.rolled_back_at === null,
    );
    if (hasUnresolvedAttempt) failed.push(name);
    else if (hasSuccessfulAttempt) applied.push(name);
    else rolledBackOnly.push(name);
  }
  return { applied, failed, rolledBackOnly, total: attemptsByName.size };
}
