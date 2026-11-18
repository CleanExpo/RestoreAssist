/**
 * RA-8461 — binds a homeowner portal token to the password it was issued for.
 *
 * The portal JWT carries `credentialFingerprint(passwordHash)`. When the
 * password is set again, the stored hash changes, the fingerprint no longer
 * matches, and `requireClientAuth` refuses every token issued before the
 * change. No schema column is needed: the password hash is the version.
 *
 * The fingerprint is an HMAC under the portal signing secret, truncated, so
 * the token never carries the bcrypt hash or anything that helps attack it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const FINGERPRINT_CONTEXT = "restoreassist:client-portal:credential:v1";

/** The one place the portal signing secret is resolved. */
export function getClientPortalSecret(): Uint8Array {
  const secret =
    process.env.CLIENT_PORTAL_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Fail closed: with no secret we can neither mint nor verify.
    throw new Error(
      "CLIENT_PORTAL_JWT_SECRET (or NEXTAUTH_SECRET) must be set for portal auth",
    );
  }
  return new TextEncoder().encode(secret);
}

export function credentialFingerprint(passwordHash: string): string {
  return createHmac("sha256", getClientPortalSecret())
    .update(`${FINGERPRINT_CONTEXT}:${passwordHash}`)
    .digest("base64url")
    .slice(0, 32);
}

/** Constant-time check that a token's fingerprint matches the current hash. */
export function credentialFingerprintMatches(
  tokenFingerprint: string | null,
  currentPasswordHash: string,
): boolean {
  if (!tokenFingerprint) return false;
  const expected = Buffer.from(credentialFingerprint(currentPasswordHash));
  const actual = Buffer.from(tokenFingerprint);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
