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
import bcrypt from "bcryptjs";
import crypto from "crypto";

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

// ─────────────────────────────────────────────────────────────────────────────
// RA-1588 — recovery / backup codes.
//
// Format: 10 codes, each 10 characters from an unambiguous alphabet
// (no 0/O/1/I/l). Displayed to the user ONCE at enrolment; stored as
// bcrypt hashes. On login, a recovery code is consumed (spliced out
// of the stored array) so each is strictly single-use.
// ─────────────────────────────────────────────────────────────────────────────

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Crockford-ish
const RECOVERY_BCRYPT_ROUNDS = 10; // codes are high-entropy; 10 rounds is ample

/** Generate N random codes + their bcrypt hashes for storage. */
export async function generateRecoveryCodes(): Promise<{
  plain: string[];
  hashed: string[];
}> {
  const plain: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
    let code = "";
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += RECOVERY_ALPHABET[bytes[j] % RECOVERY_ALPHABET.length];
    }
    // Human-friendly grouping: XXXXX-XXXXX
    plain.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  const hashed = await Promise.all(
    plain.map((c) => bcrypt.hash(c, RECOVERY_BCRYPT_ROUNDS)),
  );
  return { plain, hashed };
}

/** Parse the JSON-array column; tolerate legacy null / malformed. */
export function parseRecoveryCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((h) => typeof h === "string") : [];
  } catch {
    return [];
  }
}

export function serializeRecoveryCodes(hashes: string[]): string {
  return JSON.stringify(hashes);
}

/**
 * Attempt to consume a recovery code. Returns the new hashed-codes
 * array (with the matched entry removed) on success; null on no match.
 * Caller writes the returned array back to the DB atomically.
 */
export async function consumeRecoveryCode(
  submitted: string,
  storedHashes: string[],
): Promise<string[] | null> {
  const normalised = submitted.trim().toUpperCase();
  if (!normalised) return null;
  for (let i = 0; i < storedHashes.length; i++) {
    const match = await bcrypt.compare(normalised, storedHashes[i]);
    if (match) {
      return [...storedHashes.slice(0, i), ...storedHashes.slice(i + 1)];
    }
  }
  return null;
}

/**
 * Heuristic — does this submission *look like* a recovery code rather
 * than a 6-digit TOTP? TOTP = 6 digits; recovery code = XXXXX-XXXXX
 * (also accepts 10 uppercase chars without the dash).
 */
export function looksLikeRecoveryCode(input: string): boolean {
  const normalised = input.trim().toUpperCase().replace(/\s/g, "");
  if (/^\d{6}$/.test(normalised)) return false;
  return /^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(normalised);
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
