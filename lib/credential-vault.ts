/**
 * Credential Vault — Centralized AES-256-GCM Encryption Utility
 *
 * Reusable encryption for any sensitive data: OAuth tokens, API keys, etc.
 * Extracted from oauth-handler.ts encryption logic.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Resolve a 32-byte encryption key from a string value.
 * Supports hex-encoded (64 chars), base64-encoded (44 chars),
 * or arbitrary strings (hashed to 32 bytes via SHA-256).
 */
function resolveKey(keyString: string): Buffer {
  if (keyString.length === 64) {
    return Buffer.from(keyString, "hex");
  }
  if (keyString.length === 44) {
    return Buffer.from(keyString, "base64");
  }
  return crypto.createHash("sha256").update(keyString).digest();
}

/**
 * Get the default encryption key from environment.
 *
 * Priority order:
 *  1. CREDENTIAL_ENCRYPTION_KEY   — dedicated 32-byte hex/base64 key (recommended)
 *  2. INTEGRATION_ENCRYPTION_KEY  — legacy name, same format
 *  3. NEXTAUTH_SECRET             — always present (required by NextAuth), used as
 *                                   fallback so integrations work without extra config.
 *                                   Safe because NEXTAUTH_SECRET is already a high-
 *                                   entropy secret that never leaves the server.
 *
 * NOTE: Tokens encrypted with one key cannot be decrypted with another.
 * Once a key is in use, do not change it without re-encrypting all stored tokens
 * (or clearing the Integration table's accessToken / refreshToken columns first).
 */
function getDefaultKey(): Buffer {
  const key =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.INTEGRATION_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error(
      "No encryption key configured. Set CREDENTIAL_ENCRYPTION_KEY, INTEGRATION_ENCRYPTION_KEY, or NEXTAUTH_SECRET.",
    );
  }
  return resolveKey(key);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string, keyOverride?: Buffer): string {
  const key = keyOverride ?? getDefaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects format: iv:authTag:ciphertext (hex-encoded).
 */
export function decrypt(encryptedValue: string, keyOverride?: Buffer): string {
  const key = keyOverride ?? getDefaultKey();
  const [ivHex, authTagHex, encrypted] = encryptedValue.split(":");

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted value format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
