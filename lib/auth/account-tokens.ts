/**
 * B3 — Encrypt NextAuth `Account` OAuth tokens at rest.
 *
 * The PrismaAdapter writes Google `access_token` / `refresh_token` / `id_token`
 * to the `Account` table in plaintext on sign-in, and the token-refresh paths
 * rewrite them. A DB dump therefore exposes live refresh tokens. These helpers
 * encrypt those three columns with the AES-256-GCM credential-vault on write
 * and decrypt them on read.
 *
 * Transition safety: `decryptAccountTokens` has a **legacy-plaintext fallback**
 * — a value that isn't in cipher shape (`iv:authTag:ciphertext`, all hex) is
 * returned unchanged. So a deploy that lands this code keeps working against
 * existing plaintext rows, and the one-off backfill
 * (`scripts/backfill-encrypt-account-tokens.ts`) can run afterwards without a
 * maintenance window. `encryptAccountTokens` is idempotent (it skips a value
 * that is already ciphertext), so re-runs and double-writes can't double-encrypt.
 */
import { encrypt, decrypt } from "@/lib/credential-vault";

/** The three secret columns on `Account`. `expires_at`/`session_state` are not secrets. */
export const ACCOUNT_TOKEN_FIELDS = [
  "access_token",
  "refresh_token",
  "id_token",
] as const;

type AccountTokenField = (typeof ACCOUNT_TOKEN_FIELDS)[number];
type AccountTokenShape = Partial<
  Record<AccountTokenField, string | null | undefined>
>;

/**
 * AES-256-GCM ciphertext shape emitted by credential-vault: three hex segments
 * `iv:authTag:ciphertext`. No real Google token (ya29.… access, 1//… refresh,
 * dotted JWT id_token) matches this, so it reliably distinguishes ciphertext
 * from legacy plaintext.
 */
const CIPHER_SHAPE = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

export function isEncryptedToken(value: string): boolean {
  return CIPHER_SHAPE.test(value);
}

/** Encrypt the OAuth token fields on an account-shaped object. Idempotent; nulls pass through. */
export function encryptAccountTokens<T extends AccountTokenShape>(data: T): T {
  const out: T = { ...data };
  for (const field of ACCOUNT_TOKEN_FIELDS) {
    const value = out[field];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      !isEncryptedToken(value)
    ) {
      (out as Record<string, unknown>)[field] = encrypt(value);
    }
  }
  return out;
}

/** Decrypt the OAuth token fields. Legacy plaintext (pre-backfill) passes through unchanged. */
export function decryptAccountTokens<T extends AccountTokenShape | null>(
  account: T,
): T {
  if (!account) return account;
  const out = { ...(account as AccountTokenShape) } as AccountTokenShape;
  for (const field of ACCOUNT_TOKEN_FIELDS) {
    const value = out[field];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      isEncryptedToken(value)
    ) {
      try {
        (out as Record<string, unknown>)[field] = decrypt(value);
      } catch {
        // Cipher-shaped but undecryptable (wrong key / corrupt row): leave it
        // as-is rather than crash the caller. The token will read as invalid
        // downstream and trigger re-consent, which is the safe failure mode.
      }
    }
  }
  return out as T;
}
