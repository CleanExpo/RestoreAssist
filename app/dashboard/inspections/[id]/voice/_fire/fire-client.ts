/**
 * Browser-side calls for the fire and smoke walkthrough.
 *
 * Every POST carries an Idempotency-Key. The caller reuses the same key
 * when it retries the same payload, so a save that reached the server but
 * lost its reply is never recorded twice.
 */

import type {
  FireAction,
  FireActionResponse,
  FireBlockerBody,
  FireWalkthroughResponse,
} from "@/lib/voice/fire-smoke/schema";

export type FireCallResult<T> =
  | { ok: true; data: T }
  /** No reply, or a 5xx: keep the words and let the technician retry. */
  | { ok: false; kind: "network"; status?: number }
  /** The server refused the action and said why. */
  | { ok: false; kind: "refused"; status: number; message: string; body?: FireBlockerBody };

const base = (inspectionId: string) =>
  `/api/inspections/${inspectionId}/voice/fire-walkthrough`;

async function readRefusal(res: Response): Promise<{ message: string; body?: FireBlockerBody }> {
  try {
    const body = (await res.json()) as Partial<FireBlockerBody> & { message?: string };
    const message = body.error ?? body.message ?? `Request refused (${res.status})`;
    return { message, body: body.code ? (body as FireBlockerBody) : undefined };
  } catch {
    return { message: `Request refused (${res.status})` };
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<FireCallResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, kind: "network" };
  }
  if (res.status >= 500) return { ok: false, kind: "network", status: res.status };
  if (!res.ok) return { ok: false, kind: "refused", status: res.status, ...(await readRefusal(res)) };
  return { ok: true, data: (await res.json()) as T };
}

export function getFireWalkthrough(inspectionId: string) {
  return call<FireWalkthroughResponse>(base(inspectionId), { cache: "no-store" });
}

export function postFireAction(inspectionId: string, action: FireAction, idempotencyKey: string) {
  return call<FireActionResponse>(base(inspectionId), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(action),
  });
}

export async function startVoiceSession(inspectionId: string): Promise<string | null> {
  const result = await call<{ session?: { sessionId?: string } }>(
    `/api/inspections/${inspectionId}/voice/session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "guided" }),
    },
  );
  return result.ok ? (result.data.session?.sessionId ?? null) : null;
}

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Hands out Idempotency-Keys: the same payload, retried after a failure,
 * gets the same key; anything else gets a fresh one.
 */
export function createKeyRing() {
  let pending: { payload: string; key: string } | null = null;
  return {
    keyFor(action: FireAction): string {
      const payload = JSON.stringify(action);
      if (pending && pending.payload === payload) return pending.key;
      pending = { payload, key: newKey() };
      return pending.key;
    },
    /** Call after a reply arrives (success or refusal): the next save is new. */
    settle() {
      pending = null;
    },
  };
}
