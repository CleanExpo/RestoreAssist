/**
 * sync-status.ts — RA-1112
 *
 * Surfaces the Xero sync lifecycle to users so the fire-and-forget pattern
 * (CLAUDE.md rule #13) is no longer silent. Provides:
 *
 *   - State-machine semantics (queued → syncing → synced/failed/dead_letter)
 *   - Exponential backoff for transient failures (60s × 2^n, cap 1h)
 *   - Dead-letter after 8 attempts
 *   - Error sanitisation (rule #7 — never expose raw error.message)
 *   - Idempotent upsert keyed by (entityType, entityId) — principle #27
 *
 * This module is pure logic; the persistence wrapper
 * `lib/integrations/xero/sync-status-runner.ts` composes these with Prisma.
 * Keeping the state-machine pure lets vitest verify transitions and backoff
 * without a DB. `applyAttemptStart / applyAttemptSuccess / applyAttemptFailure`
 * return the next row shape — callers write it.
 */

export type XeroSyncState =
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "dead_letter";

export type XeroSyncEntityType =
  | "invoice"
  | "credit_note"
  | "payment"
  | "contact"
  | "transition";

/** Snapshot of a `XeroSyncStatus` row (pure — no Prisma coupling). */
export interface XeroSyncRow {
  entityType: XeroSyncEntityType;
  entityId: string;
  userId: string;
  xeroEntityId: string | null;
  state: XeroSyncState;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lastError: string | null;
  nextRetryAt: Date | null;
}

/** Business constants — tuned by ops, not config, so tests are deterministic. */
export const MAX_ATTEMPTS = 8;
export const BASE_BACKOFF_MS = 60_000; // 60 seconds
export const MAX_BACKOFF_MS = 60 * 60_000; // 1 hour

/**
 * Compute the next retry timestamp given how many attempts have completed.
 *
 * Sequence (attemptCount → delay): 1→60s, 2→120s, 3→240s, 4→480s,
 * 5→960s, 6→1920s (capped to 1h), 7→1h, 8→dead_letter (no retry).
 */
export function nextRetryAt(
  attemptCount: number,
  now: Date = new Date(),
): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const exponent = Math.max(0, attemptCount - 1);
  const raw = BASE_BACKOFF_MS * 2 ** exponent;
  const delay = Math.min(raw, MAX_BACKOFF_MS);
  return new Date(now.getTime() + delay);
}

/**
 * Convert a raw thrown error into a user-safe summary (rule #7).
 *
 * Strips anything that looks like a token, URL, stack frame, or internal
 * file path. When in doubt, returns a generic message — the raw detail
 * stays in server logs only.
 */
export function sanitizeError(err: unknown): string {
  if (err === null || err === undefined) return "Unknown sync error.";
  const msg = err instanceof Error ? err.message : String(err);

  // Recognise common transport failures and map to a user-safe label.
  if (/401|unauthor/i.test(msg)) {
    return "Xero connection expired — reconnect to continue syncing.";
  }
  if (/403|forbidden/i.test(msg)) {
    return "Xero rejected the request due to permissions.";
  }
  if (/429|rate.?limit|too many/i.test(msg)) {
    return "Xero rate-limited us — retrying automatically.";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|network/i.test(msg)) {
    return "Network error talking to Xero — retrying automatically.";
  }
  if (/4\d\d/.test(msg)) {
    return "Xero rejected the data — open the record to review.";
  }
  if (/5\d\d/.test(msg)) {
    return "Xero service error — retrying automatically.";
  }
  return "Sync failed — retrying automatically.";
}

/**
 * Compute the row shape when we START an attempt. Caller upserts.
 *
 * Transitions any prior state into `syncing` and bumps `lastAttemptAt`.
 * `attemptCount` is NOT incremented here — we count completed attempts,
 * so the bump happens in success/failure transitions.
 */
export function applyAttemptStart(
  row: Pick<XeroSyncRow, "attemptCount" | "xeroEntityId">,
  now: Date = new Date(),
): Pick<
  XeroSyncRow,
  "state" | "lastAttemptAt" | "lastError" | "nextRetryAt" | "xeroEntityId"
> {
  return {
    state: "syncing",
    lastAttemptAt: now,
    lastError: null,
    nextRetryAt: null,
    xeroEntityId: row.xeroEntityId,
  };
}

/**
 * Compute the row shape on successful sync. Terminal state — no more retries.
 */
export function applyAttemptSuccess(
  row: Pick<XeroSyncRow, "attemptCount">,
  xeroEntityId: string,
  now: Date = new Date(),
): Pick<
  XeroSyncRow,
  | "state"
  | "attemptCount"
  | "lastAttemptAt"
  | "lastError"
  | "nextRetryAt"
  | "xeroEntityId"
> {
  return {
    state: "synced",
    attemptCount: row.attemptCount + 1,
    lastAttemptAt: now,
    lastError: null,
    nextRetryAt: null,
    xeroEntityId,
  };
}

/**
 * Compute the row shape on failed sync. At MAX_ATTEMPTS → dead_letter
 * (terminal); below that → queued with a nextRetryAt.
 */
export function applyAttemptFailure(
  row: Pick<XeroSyncRow, "attemptCount">,
  err: unknown,
  now: Date = new Date(),
): Pick<
  XeroSyncRow,
  "state" | "attemptCount" | "lastAttemptAt" | "lastError" | "nextRetryAt"
> {
  const nextAttemptCount = row.attemptCount + 1;
  const sanitized = sanitizeError(err);
  if (nextAttemptCount >= MAX_ATTEMPTS) {
    return {
      state: "dead_letter",
      attemptCount: nextAttemptCount,
      lastAttemptAt: now,
      lastError: sanitized,
      nextRetryAt: null,
    };
  }
  return {
    state: "queued",
    attemptCount: nextAttemptCount,
    lastAttemptAt: now,
    lastError: sanitized,
    nextRetryAt: nextRetryAt(nextAttemptCount, now),
  };
}

/**
 * Compute the row shape for a manual "retry now" action from the UI.
 * Only valid from failed/dead_letter — resets to queued with immediate retry.
 */
export function applyManualRetry(
  row: Pick<XeroSyncRow, "state" | "attemptCount">,
  now: Date = new Date(),
):
  | {
      ok: true;
      patch: Pick<
        XeroSyncRow,
        "state" | "lastError" | "nextRetryAt" | "attemptCount"
      >;
    }
  | { ok: false; reason: string } {
  if (row.state !== "failed" && row.state !== "dead_letter") {
    return {
      ok: false,
      reason: `Cannot manually retry a sync in state '${row.state}'.`,
    };
  }
  return {
    ok: true,
    patch: {
      state: "queued",
      lastError: null,
      nextRetryAt: now,
      // Reset the counter so the user gets a fresh 8-attempt budget
      // rather than immediately bouncing back to dead_letter.
      attemptCount: 0,
    },
  };
}
