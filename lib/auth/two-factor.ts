/**
 * RA-1260 — TOTP (RFC 6238) helper for 2FA.
 *
 * - `generateSecret()` produces a new base32 secret + the otpauth:// URL
 *   that authenticator apps (Authy, 1Password, Google Authenticator) scan.
 * - `verifyToken()` checks a 6-digit code against a stored secret with
 *   a ±1 step window (±30 s) to tolerate clock drift.
 *
 * Uses the `otpauth` library which implements HOTP/TOTP per RFC 4226/6238.
 */

import * as OTPAuth from "otpauth";

const ISSUER = "RestoreAssist";
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = "SHA1";
const WINDOW = 1; // ±1 step (±30 s) clock skew tolerance

/** Generate a new TOTP secret + otpauth:// URL for a given user. */
export function generateSecret(accountLabel: string): {
  secretBase32: string;
  otpauthUrl: string;
} {
  // 20 random bytes → 160-bit secret → base32 = 32 chars. RFC-recommended size.
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret,
  });
  return {
    secretBase32: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

/** Verify a 6-digit code against a stored base32 secret. */
export function verifyToken(secretBase32: string, token: string): boolean {
  if (!secretBase32 || !token) return false;
  const cleaned = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;

  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    // validate() returns the delta (number of steps off) or null if invalid.
    const delta = totp.validate({ token: cleaned, window: WINDOW });
    return delta !== null;
  } catch {
    return false;
  }
}

/** Rebuild the otpauth:// URL from an existing secret (for re-displaying QR). */
export function otpauthUrlFor(
  secretBase32: string,
  accountLabel: string,
): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}
