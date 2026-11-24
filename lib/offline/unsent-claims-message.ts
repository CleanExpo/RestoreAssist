/**
 * RA-8641 — the one owner of the wording for claims kept on this device.
 *
 * Both the offline capture page and the sign-out notice on the login page call
 * describeUnsentClaims(); neither builds its own sentence.
 *
 * Only a claim in state "queued" is sent again: drainOfflineClaims() skips every
 * other state and nothing sets a refused ("failed") or held ("needs_review")
 * claim back to "queued". So only queued claims may be described as waiting to
 * send, and the others must never be promised to send on sign-in. Retrying,
 * exporting or discarding them is RA-8560.
 *
 * Counts only: no address, note or photo is read here, so the login page can
 * show the result without exposing anyone's claim details.
 */
import type { OfflineClaimState } from "./claim-capture-queue";

export interface ClaimStateCounts {
  queued: number;
  failed: number;
  /** "needs_review", plus any unrecognised state: neither is ever sent again. */
  needsReview: number;
}

/** Where the sentence is shown: the offline capture page, or the login page after sign-out. */
export type UnsentClaimsAudience = "signed-in" | "signed-out";

export function countClaimsByState(claims: ReadonlyArray<{ state: OfflineClaimState }>): ClaimStateCounts {
  const counts: ClaimStateCounts = { queued: 0, failed: 0, needsReview: 0 };
  for (const claim of claims) {
    if (claim.state === "queued") counts.queued++;
    else if (claim.state === "failed") counts.failed++;
    else counts.needsReview++;
  }
  return counts;
}

const claims = (n: number) => `${n} claim${n === 1 ? "" : "s"}`;
const notAutomatic = (n: number) => `${n === 1 ? "It" : "They"} will not be sent automatically.`;

/**
 * The message for the claims on this device. Returns null only for the login
 * page when there is nothing to tell; the offline page always shows a line.
 */
export function describeUnsentClaims(counts: ClaimStateCounts, audience: UnsentClaimsAudience): string | null {
  const queued = Math.max(0, counts.queued);
  const failed = Math.max(0, counts.failed);
  const needsReview = Math.max(0, counts.needsReview);
  const parts: string[] = [];

  if (queued > 0) {
    parts.push(
      audience === "signed-out"
        ? `You have ${claims(queued)} not yet sent. ${queued === 1 ? "It stays" : "They stay"} on this device until you sign in and send ${queued === 1 ? "it" : "them"}.`
        : `${claims(queued)} waiting to send.`,
    );
  }
  if (failed > 0) {
    parts.push(`${claims(failed)} could not be sent and ${failed === 1 ? "needs" : "need"} attention. ${notAutomatic(failed)}`);
  }
  if (needsReview > 0) {
    parts.push(
      `${claims(needsReview)} may or may not have been sent and ${needsReview === 1 ? "needs" : "need"} checking. ${notAutomatic(needsReview)}`,
    );
  }

  if (parts.length === 0) return audience === "signed-in" ? "No claims waiting to send." : null;
  return parts.join(" ");
}
