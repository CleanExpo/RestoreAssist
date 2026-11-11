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
  /**
   * Anything that does not prove the outcome: no reply, a timeout (408), an
   * in-progress or unverified reply (409), throttling (429), a 5xx, or any
   * status not on the final list below. The save may have happened, so the
   * technician retries with the same key; it is never released.
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

/**
 * The only refusals that release a retry key (kind K12: an allow-list, never a
 * list of exceptions). Each is returned before anything is written, or is the
 * fire route's own decided refusal: 400 bad request, 401 no login, 403 wrong
 * session, 404 no access, 422 walkthrough rule.
 */
export const FINAL_REFUSAL_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422]);

async function call<T>(input: string, init?: RequestInit): Promise<FireCallResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, kind: "unconfirmed" };
  }
  if (res.ok) return { ok: true, data: (await res.json()) as T };
  if (FINAL_REFUSAL_STATUSES.has(res.status)) {
    return { ok: false, kind: "refused", status: res.status, ...(await readRefusal(res)) };
  }
  return { ok: false, kind: "unconfirmed", status: res.status };
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
 * Hands out Idempotency-Keys. Every save whose reply never arrived keeps its
 * own key (kind K12), so retrying it reuses that key even after other answers
 * were sent in between, and the server cannot file it twice.
 *
 * Design rule (K12, fourth instance): a key lives exactly as long as its save
 * is unconfirmed. settle() is the ONLY place a key is removed; there is no
 * size cap and no eviction. Each entry is one short string per answer that
 * never got a final reply, so memory is bounded by the answers on one job.
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
      return key;
    },
    /** Call when this action's reply arrives (success or refusal). */
    settle(action: FireAction) {
      unconfirmed.delete(JSON.stringify(action));
    },
  };
}
