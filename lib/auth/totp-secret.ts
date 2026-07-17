/**
 * TOTP secret at-rest encryption (P0-1 security review M3).
 *
 * `User.twoFactorSecret` previously stored the base32 TOTP shared secret in
 * plaintext, so a database dump yielded working second factors for every
 * 2FA-enabled user. These helpers encrypt it with the AES-256-GCM credential
 * vault on write and decrypt on read, with a fallback that transparently reads
 * legacy plaintext rows (they are re-encrypted the next time 2FA is set up).
 */

import { encrypt, decrypt } from "@/lib/credential-vault";

// The vault emits `iv:authTag:ciphertext`, all hex. A base32 TOTP secret is
// [A-Z2-7]+ — no colons, and letters outside [a-f] — so the two are
// unambiguous.
const ENCRYPTED_SHAPE = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

export function isEncryptedTotpSecret(stored: string): boolean {
  return ENCRYPTED_SHAPE.test(stored);
}

/** Encrypt a base32 TOTP secret for storage. */
export function encryptTotpSecret(secretBase32: string): string {
  return encrypt(secretBase32);
}

/**
 * Return the usable base32 TOTP secret from a stored value, decrypting an
 * encrypted value and passing a legacy plaintext value through unchanged.
 */
export function readTotpSecret(stored: string): string {
  return isEncryptedTotpSecret(stored) ? decrypt(stored) : stored;
}
