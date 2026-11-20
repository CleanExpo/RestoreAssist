/**
 * RA-7090 slice 2 P1 (capture path): the fail-closed capture-submit
 * orchestration, extracted from
 * app/dashboard/inspections/[id]/capture/page.tsx so it is unit-testable in
 * isolation from React, fetch and crypto.
 *
 * The defect this closes: on any signing/registration error the capture page
 * silently DOWNGRADED to an unsigned submission, and after a signed POST
 * returned 403 it registered a fresh key then DISCARDED it and retried
 * UNSIGNED with the same success toast. On a legal-facing chain-of-custody
 * product an unsigned record must never masquerade as a completed capture.
 *
 * The invariant enforced here: for an authenticated capture the ONLY submit
 * seam is `signAndPost`, which SIGNS. There is no unsigned fallback in the
 * orchestration — a signing failure propagates (surfaced to the technician),
 * and a 403 rotates the key and RE-SIGNS rather than resubmitting unsigned.
 */

/**
 * RA-8388: how long the capture form waits for the evidence POST (request
 * and answer body together) before it gives the technician Retry back.
 *
 * No client fetch in this repository had a shared limit to reuse. 30 seconds
 * is longer than a slow upload of a small JSON body and shorter than a
 * technician's patience with a form whose every control is disabled.
 */
export const EVIDENCE_POST_TIMEOUT_MS = 30_000;

/** RA-8388: the same limit for one `POST /api/devices/signing-key` call. */
export const DEVICE_KEY_REGISTRATION_TIMEOUT_MS = 30_000;

/**
 * RA-8388: how long the capture page waits for the evidence list it reloads
 * after "Close and check" (request and answer body together).
 *
 * The step's reading form stays shut while that reload is out, so this is
 * also the longest the technician can be held. It is a small GET; 20 seconds
 * is a chosen figure, not a measured one.
 */
export const EVIDENCE_LIST_RELOAD_TIMEOUT_MS = 20_000;

/**
 * A request that was given up on. It is UNKNOWN whether the server acted on
 * it, so the caller must treat it exactly like a lost response: keep the
 * draft and replay the same bytes under the same key.
 */
export class RequestTimeoutError extends Error {
  readonly timedOut = true;

  constructor(what: string, limitMs: number) {
    super(`${what} timed out after ${limitMs} ms`);
    this.name = "RequestTimeoutError";
  }
}

/** True for any error that says a request ran out of time. */
export function isTimeLimitError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { timedOut?: unknown }).timedOut === true
  );
}

/**
 * Run `run` with a time limit.
 *
 * `AbortController` plus a timer, not `AbortSignal.timeout`: older WebViews
 * lack the latter. The timer is RACED against the work as well as aborting
 * it, because an abort only helps when the callee honours the signal, and a
 * form with every control disabled cannot depend on that. The rejection is
 * settled before the abort is raised, so the caller always sees the timeout
 * and never the platform's own abort error.
 */
export async function withTimeLimit<T>(
  what: string,
  limitMs: number,
  run: (signal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
  const controller =
    typeof AbortController === "undefined" ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError(what, limitMs));
      controller?.abort();
    }, limitMs);
  });
  try {
    return await Promise.race([run(controller?.signal), limit]);
  } finally {
    clearTimeout(timer);
  }
}

export interface CaptureSubmitResult {
  status: number;
  ok: boolean;
}

export interface SubmitSignedCaptureDeps {
  /**
   * Sign the capture with the current device key and POST it. `attempt`
   * distinguishes the first submission from the post-rotation re-signature so
   * the caller can vary the idempotency key. MUST reject (throw) if signing
   * or registration fails — the orchestration never falls back to unsigned.
   */
  signAndPost: (attempt: "initial" | "resigned") => Promise<CaptureSubmitResult>;
  /** Rotate to a fresh device signing key after a 403 (rejected key). */
  rotateKey: () => Promise<void>;
}

/**
 * Submit a SIGNED capture with fail-closed semantics. Returns the final
 * HTTP-ish result; the caller decides how to surface a non-ok response
 * (never as a success). Any signing or rotation failure propagates.
 */
export async function submitSignedCapture(
  deps: SubmitSignedCaptureDeps,
): Promise<CaptureSubmitResult> {
  const first = await deps.signAndPost("initial");
  if (first.status !== 403) {
    return first;
  }
  // A 403 on a signed submission means the key we signed with was rejected
  // (revoked, or registered to another device). Rotate to a fresh key and
  // RE-SIGN — never resubmit unsigned.
  await deps.rotateKey();
  return deps.signAndPost("resigned");
}
