/**
 * P2 / V1 P2-5 — attach Idempotency-Key on mutating web requests.
 *
 * RA-8394: the server guard (`withIdempotency`) dedupes by key, so the key
 * must be made once per USER ACTION and reused for every retry and every
 * repeated click of that action. A fresh key per call lets a double click or
 * a retry after a lost reply save twice. This helper therefore never invents
 * a key on its own: pass a `MutationAttempt` (the normal case) or an explicit
 * `idempotencyKey`.
 */

export function idempotencyKeyForMutation(scope: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${scope}:${uuid}`;
}

/**
 * Holds the key for one user action. Create it once per form or button
 * (e.g. in a `useRef`), not per click.
 *
 * - Same body as the last unsettled send: same key (double click, retry).
 * - Different body: new key. The server answers a reused key with a
 *   different body with 409 on every retry, so an edited form needs one.
 * - Settled after a success or a final client error, so the next deliberate
 *   action is not replayed from the server's cache.
 */
export interface MutationAttempt {
  keyFor(body: string): string;
  /** Clear the key when the response is final. */
  observe(response: Response): void;
  settle(): void;
}

/** Status codes after which the same request may still succeed or may already have been saved. */
const NOT_FINAL_CLIENT_STATUSES = new Set([401, 403, 408, 409, 425, 429]);

export function isFinalMutationResponse(response: Response): boolean {
  if (response.ok) return true;
  return (
    response.status >= 400 &&
    response.status < 500 &&
    !NOT_FINAL_CLIENT_STATUSES.has(response.status)
  );
}

export function createMutationAttempt(scope: string): MutationAttempt {
  let current: { key: string; body: string } | null = null;
  return {
    keyFor(body) {
      if (!current || current.body !== body) {
        current = { key: idempotencyKeyForMutation(scope), body };
      }
      return current.key;
    },
    observe(response) {
      if (isFinalMutationResponse(response)) current = null;
    },
    settle() {
      current = null;
    },
  };
}

type IdempotentInit = Omit<RequestInit, "body"> &
  (
    | { attempt: MutationAttempt; body: string; idempotencyKey?: never }
    | { idempotencyKey: string; body?: RequestInit["body"]; attempt?: never }
  );

export async function fetchWithIdempotency(
  input: RequestInfo | URL,
  init: IdempotentInit,
): Promise<Response> {
  const { attempt, idempotencyKey, ...rest } = init as RequestInit & {
    attempt?: MutationAttempt;
    idempotencyKey?: string;
  };
  if (!attempt && !idempotencyKey) {
    throw new Error(
      "fetchWithIdempotency needs an attempt (createMutationAttempt) or an explicit idempotencyKey",
    );
  }
  if (attempt && typeof rest.body !== "string") {
    throw new Error("fetchWithIdempotency with an attempt needs a string body");
  }
  const key = attempt ? attempt.keyFor(rest.body as string) : (idempotencyKey as string);

  const headers = new Headers(rest.headers);
  if (!headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", key);
  }
  if (!headers.has("X-RestoreAssist-Mutation-Id")) {
    headers.set("X-RestoreAssist-Mutation-Id", key);
  }

  // A thrown fetch (lost reply) leaves the key in place for the retry.
  const response = await fetch(input, { ...rest, headers });
  attempt?.observe(response);
  return response;
}
