/**
 * Browser-side calls for the fire and smoke walkthrough.
 *
 * Every POST carries an Idempotency-Key. The caller reuses the same key
 * when it retries the same payload, so a save that reached the server but
 * lost its reply is never recorded twice.
 */

import type { z } from "zod";
import {
  fireActionReplySchema,
  fireWalkthroughReplySchema,
  voiceSessionReplySchema,
} from "@/lib/voice/fire-smoke/reply-schema";
import type { FireAction, FireBlockerBody } from "@/lib/voice/fire-smoke/schema";

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

/**
 * Never throws (round 15), and never trusts a shape (round 16, kind K15). A
 * reply is "ok" only when it is a 2xx whose body was read, parsed and passed
 * the caller's schema in full. Anything that cannot be proven, from a dropped
 * connection to an unreadable or malformed 2xx body, is "unconfirmed", so a
 * save stays frozen with its key and the screen never reads a missing field.
 * The schema is required: no call can opt out of the check.
 */
async function call<T>(input: string, init: RequestInit, schema: z.ZodType<T>): Promise<FireCallResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, kind: "unconfirmed" };
  }
  if (res.ok) {
    try {
      const parsed = schema.safeParse(await res.json());
      if (parsed.success) return { ok: true, data: parsed.data };
    } catch {
      // Unreadable body: fall through to unconfirmed.
    }
    return { ok: false, kind: "unconfirmed", status: res.status };
  }
  if (FINAL_REFUSAL_STATUSES.has(res.status)) {
    return { ok: false, kind: "refused", status: res.status, ...(await readRefusal(res)) };
  }
  return { ok: false, kind: "unconfirmed", status: res.status };
}

export function getFireWalkthrough(inspectionId: string) {
  return call(base(inspectionId), { cache: "no-store" }, fireWalkthroughReplySchema);
}

export function postFireAction(inspectionId: string, action: FireAction, idempotencyKey: string) {
  return call(
    base(inspectionId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(action),
    },
    fireActionReplySchema,
  );
}

export async function startVoiceSession(inspectionId: string): Promise<string | null> {
  const result = await call(
    `/api/inspections/${inspectionId}/voice/session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "guided" }),
    },
    voiceSessionReplySchema,
  );
  return result.ok ? result.data.session.sessionId : null;
}

/**
 * A fresh Idempotency-Key for one save. The key belongs to the frozen save it
 * is created with (use-fire-walkthrough, HeldSave), never to the payload's
 * contents, so nothing on screen can change it (kind K12).
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
