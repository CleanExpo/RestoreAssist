/**
 * RA-8589 — one owner for the lifetime of an emailed authority-form signing link.
 *
 * A signing link is `/sign/<signatureRequestToken>`. It is set only by
 * POST /api/authority-forms/:id/send-signature-request, which also stamps
 * `signatureRequestSentAt`. The link is live for SIGNING_LINK_TTL_DAYS from
 * that stamp; a resend issues a new token and a new stamp, so it restarts the
 * period. No new column is needed.
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

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * time was never emailed by the send route, so it is treated as expired.
 */
export function isSigningLinkLive(
  sentAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sentAt) return false;
  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return false;
  return sent.getTime() > signingLinkCutoff(now).getTime();
}

/** Where fragment for AuthorityFormSignature: its signing link has not expired. */
export function liveSigningLinkWhere(now: Date = new Date()) {
  return { signatureRequestSentAt: { gt: signingLinkCutoff(now) } };
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
