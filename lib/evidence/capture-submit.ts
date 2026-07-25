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
