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
  /**
   * The save may or may not have happened: no reply, a 5xx, or a 409 from the
   * idempotency layer (still in progress, or completion unverified). The fire
   * route's own refusals are only ever 400 or 422, so a 409 is never final.
   * Retry with the same key; never release it.
   */
  | { ok: false; kind: "unconfirmed"; status?: number }
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
    return { ok: false, kind: "unconfirmed" };
  }
  if (res.status >= 500 || res.status === 409) return { ok: false, kind: "unconfirmed", status: res.status };
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

/** Unconfirmed saves remembered at once; the oldest is forgotten beyond this. */
const MAX_UNCONFIRMED = 50;

/**
 * Hands out Idempotency-Keys. Every save whose reply never arrived keeps its
 * own key (kind K12), so retrying it reuses that key even after other answers
 * were sent in between, and the server cannot file it twice. A key is
 * released only when that same payload's reply arrives.
 */
export function createKeyRing() {
  const unconfirmed = new Map<string, string>();
  return {
    keyFor(action: FireAction): string {
      const payload = JSON.stringify(action);
      const known = unconfirmed.get(payload);
      if (known) return known;
      const key = newKey();
      unconfirmed.set(payload, key);
      if (unconfirmed.size > MAX_UNCONFIRMED) unconfirmed.delete(unconfirmed.keys().next().value as string);
      return key;
    },
    /** Call when this action's reply arrives (success or refusal). */
    settle(action: FireAction) {
      unconfirmed.delete(JSON.stringify(action));
    },
  };
}
