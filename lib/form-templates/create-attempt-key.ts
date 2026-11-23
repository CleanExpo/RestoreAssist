/**
 * RA-8543 — the Idempotency-Key for one form-template create attempt.
 *
 * The same body sent again (a retry after a lost reply or a double submit)
 * reuses the key, so POST /api/form-templates replays the first reply instead
 * of creating a second template. A changed form gets a new key, because the
 * server refuses a key reused with a different body. Once the server has given
 * an answer, the caller calls `settle` so the next attempt starts fresh.
 */
export interface CreateAttempt {
  body: string;
  key: string;
}

export function createAttemptKey(
  slot: { current: CreateAttempt | null },
  body: string,
): string {
  if (slot.current && slot.current.body === body) return slot.current.key;
  const key = globalThis.crypto.randomUUID();
  slot.current = { body, key };
  return key;
}

/**
 * Release the key after a reply that settles the attempt. A 5xx is not cached
 * by the server and a 409 can mean the first request is still running, so both
 * keep the key and a retry replays instead of creating again.
 */
export function settleCreateAttempt(
  slot: { current: CreateAttempt | null },
  status: number,
): void {
  if (status < 500 && status !== 409) slot.current = null;
}
