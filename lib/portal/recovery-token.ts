/**
 * RA-8613 — the stateless password-recovery link for a homeowner portal account.
 *
 * WHY STATELESS. The first design reused a PortalInvitation token as the reset
 * link. An invitation is a row the contractor can list (GET /api/portal/
 * invitations returns its token), so a contractor could request recovery for
 * the homeowner's address, read the token and set the homeowner's password.
 * This link is never stored and never returned by any API: it exists only in
 * the email sent to the address on the account.
 *
 * WHAT IT IS. An HS256 JWT under the portal signing secret with its own type
 * (`client-portal-recovery`), so it is never accepted as a portal session and
 * a portal session is never accepted as a recovery link. It names the account
 * (sub, clientId, email) and carries the fingerprint of the CURRENT password
 * hash (`cfp`, the same HMAC the portal session uses).
 *
 * DEAD ONCE USED. Setting the password changes the hash, so the fingerprint no
 * longer matches and every link issued before then is refused: single use
 * without a table. The accept route also writes the new hash only where the
 * stored hash is still the one the link names, so two simultaneous uses cannot
 * both win.
 *
 * ONE LINK PER WINDOW. Issue and expiry times snap to a half-hour window, so
 * repeated requests in a window produce the identical token rather than a pile
 * of independent live links; at most two distinct links are ever live at once,
 * and the first use of any of them kills every other.
 *
 * Callers: lib/portal/recovery-email.ts (mint, email only),
 * app/api/portal/invitations/accept and /verify (check). The allow-list test in
 * lib/portal/__tests__/recovery-token.test.ts fails when any other file
 * imports this module.
 */

import { SignJWT, jwtVerify } from "jose";
import {
  credentialFingerprint,
  credentialFingerprintMatches,
  getClientPortalSecret,
} from "@/lib/portal/credential-fingerprint";

const RECOVERY_TYPE = "client-portal-recovery" as const;
/** Issue and expiry snap to this window (seconds). */
export const RECOVERY_WINDOW_SECONDS = 30 * 60;
/** A link lives this long from the start of its window: 30 to 60 minutes. */
export const RECOVERY_LIFETIME_SECONDS = 60 * 60;

export interface RecoveryAccount {
  clientUserId: string;
  clientId: string;
  email: string;
  /** Current ClientUser.passwordHash; only its fingerprint enters the token. */
  passwordHash: string;
}

export interface RecoveryClaims {
  clientUserId: string;
  clientId: string;
  email: string;
  credentialFingerprint: string;
  expiresAt: Date;
}

export async function signRecoveryToken(
  account: RecoveryAccount,
  now: Date = new Date(),
): Promise<string> {
  const windowStart =
    Math.floor(now.getTime() / 1000 / RECOVERY_WINDOW_SECONDS) *
    RECOVERY_WINDOW_SECONDS;
  return new SignJWT({
    clientId: account.clientId,
    email: account.email,
    typ: RECOVERY_TYPE,
    cfp: credentialFingerprint(account.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(account.clientUserId)
    .setIssuedAt(windowStart)
    .setExpirationTime(windowStart + RECOVERY_LIFETIME_SECONDS)
    .sign(getClientPortalSecret());
}

/** The claims of a genuine, unexpired recovery link, or null. */
export async function verifyRecoveryToken(
  token: string,
  now: Date = new Date(),
): Promise<RecoveryClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getClientPortalSecret(), {
      algorithms: ["HS256"],
      currentDate: now,
    });
    if (
      payload.typ !== RECOVERY_TYPE ||
      typeof payload.sub !== "string" ||
      typeof payload.clientId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.cfp !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return {
      clientUserId: payload.sub,
      clientId: payload.clientId,
      email: payload.email,
      credentialFingerprint: payload.cfp,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    // A bad signature, an expired link and a missing secret all read as "not a
    // usable link". The missing-secret case is reported by the portal session
    // routes (503); here it must never let a link through.
    return null;
  }
}

/** True while the link still matches the account's current password. */
export function recoveryLinkIsLive(
  claims: RecoveryClaims,
  currentPasswordHash: string,
): boolean {
  return credentialFingerprintMatches(
    claims.credentialFingerprint,
    currentPasswordHash,
  );
}

/** A recovery link is a JWT (three dot-separated parts); an invitation token is not. */
export function looksLikeRecoveryToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 2048 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  );
}
