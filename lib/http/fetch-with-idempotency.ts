/**
 * P2 / V1 P2-5 — attach Idempotency-Key on mutating web requests.
 */

export function idempotencyKeyForMutation(scope: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${scope}:${uuid}`;
}

export async function fetchWithIdempotency(
  input: RequestInfo | URL,
  init: RequestInit & { idempotencyKey?: string; mutationScope?: string } = {},
): Promise<Response> {
  const key =
    init.idempotencyKey ??
    (init.mutationScope
      ? idempotencyKeyForMutation(init.mutationScope)
      : idempotencyKeyForMutation("web"));

  const headers = new Headers(init.headers);
  if (!headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", key);
  }
  if (!headers.has("X-RestoreAssist-Mutation-Id")) {
    headers.set("X-RestoreAssist-Mutation-Id", key);
  }

  const { idempotencyKey: _k, mutationScope: _s, ...rest } = init;
  return fetch(input, { ...rest, headers });
}
