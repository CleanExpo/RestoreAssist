/**
 * RA-8589 — one owner for the lifetime of an emailed authority-form signing link.
 *
 * A signing link is `/sign/<signatureRequestToken>`. It is set only by
 * POST /api/authority-forms/:id/send-signature-request, which also stamps
 * `signatureRequestSentAt`. The link is live for SIGNING_LINK_TTL_DAYS from
 * that stamp; a resend issues a new token and a new stamp, so it restarts the
 * period. No new column is needed.
 *
 * A token with no recorded send time (a link issued before the stamp was kept)
 * is not cut off at deploy. Founder ruling, 26/11/2026: it keeps working for
 * UNSTAMPED_GRACE_DAYS from the deploy day, then expires like any other link.
 *
 * The client portal lists the same token (app/api/portal/[token]/authorities),
 * so an expired link is hidden there too rather than shown as a button that
 * fails. Staff renew it with Resend.
 *
 * Every reader of the token takes its rule from here; the allow-list test in
 * lib/authority-forms/__tests__/signing-link.test.ts fails when a route that
 * looks a signature up by token skips this module.
 */

/** Days an unsigned signing link stays usable after it was last sent. */
export const SIGNING_LINK_TTL_DAYS = 14;

/** Days a link with no recorded send time keeps working after this deploys. */
export const UNSTAMPED_GRACE_DAYS = 14;

/**
 * The deploy day the grace for unstamped links counts from (founder ruling,
 * 26/11/2026). If the deploy day moves, change this one date; the guard test
 * pins the resulting end date.
 */
export const UNSTAMPED_GRACE_STARTS_ON = new Date("2026-11-26T00:00:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment the grace for links with no recorded send time ends. */
export function unstampedGraceEndsAt(): Date {
  return new Date(
    UNSTAMPED_GRACE_STARTS_ON.getTime() + UNSTAMPED_GRACE_DAYS * DAY_MS,
  );
}

/** True while a token with no recorded send time may still be used. */
export function isUnstampedGraceOpen(now: Date = new Date()): boolean {
  return now.getTime() < unstampedGraceEndsAt().getTime();
}

/** The earliest send time that is still live at `now`. */
export function signingLinkCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - SIGNING_LINK_TTL_DAYS * DAY_MS);
}

/** When a link sent at `sentAt` stops working. */
export function signingLinkExpiresAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + SIGNING_LINK_TTL_DAYS * DAY_MS);
}

/**
 * True when a link sent at `sentAt` may still be used. A token with no send
 * time is live only inside the unstamped grace; an unreadable send time is
 * never live.
 */
export function isSigningLinkLive(
  sentAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (sentAt === null || sentAt === undefined) return isUnstampedGraceOpen(now);
  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return false;
  return sent.getTime() > signingLinkCutoff(now).getTime();
}

/**
 * Where fragment for AuthorityFormSignature: its signing link has not expired.
 * A live link is a row that holds a token, so EVERY branch carries the token
 * test: the portal revoke and rotate clear the token and leave the send time,
 * and such a row must never match. Inside the unstamped grace the second
 * branch also takes a token with no send time. The test in
 * lib/authority-forms/__tests__/signing-link.test.ts walks every branch.
 */
export function liveSigningLinkWhere(now: Date = new Date()) {
  const hasToken = { signatureRequestToken: { not: null } };
  const stamped = {
    signatureRequestSentAt: { gt: signingLinkCutoff(now) },
    ...hasToken,
  };
  const unstamped = { signatureRequestSentAt: null, ...hasToken };
  return { OR: isUnstampedGraceOpen(now) ? [stamped, unstamped] : [stamped] };
}

/**
 * Where fragment for AuthorityFormSignature: the slot still holds the email
 * and token the caller read. A writer that issues a token and then emails it
 * must use this in the issuing write, so a correction or cancellation landing
 * between its read and its write makes the write match nothing instead of
 * sending a live link to an address that was just replaced.
 */
export function unchangedSlotWhere(slot: {
  signatoryEmail: string | null;
  signatureRequestToken?: string | null;
}) {
  // null, never undefined: Prisma reads undefined as "no filter".
  return {
    signatoryEmail: slot.signatoryEmail,
    signatureRequestToken: slot.signatureRequestToken ?? null,
  };
}

/**
 * Data that switches a signing link off: the token is gone, so the old URL
 * returns the same not-found reply as an unknown token.
 */
export function clearedSigningLinkData() {
  return {
    signatureRequestToken: null,
    signatureRequestSent: false,
    signatureRequestSentAt: null,
  };
}
