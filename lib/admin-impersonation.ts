/**
 * RA-1352 — admin impersonation token helpers.
 *
 * Signing: HMAC-SHA256 of `${adminUserId}:${targetUserId}:${jti}:${exp}`
 * using NEXTAUTH_SECRET. Short-lived (30 min default). Stored jti in
 * `AdminImpersonation` so revocation is one DELETE / UPDATE endedAt.
 *
 * This file ONLY ISSUES AND VERIFIES TOKENS. Integrating the token
 * into the session — making downstream queries act as the target user
 * — is a follow-up ticket that requires NextAuth callback changes +
 * careful review. This PR ships the audit trail + endpoints so the
 * pattern is in place before the runtime cutover.
 */

import crypto from "crypto";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min

export interface ImpersonationToken {
  jti: string; // token id (also stored on AdminImpersonation row)
  adminUserId: string;
  targetUserId: string;
  expiresAt: number; // unix ms
  signature: string; // base64url HMAC
}

function hmac(payload: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET required for impersonation tokens");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueImpersonationToken(
  adminUserId: string,
  targetUserId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): ImpersonationToken {
  const jti = crypto.randomBytes(16).toString("base64url");
  const expiresAt = Date.now() + ttlMs;
  const payload = `${adminUserId}:${targetUserId}:${jti}:${expiresAt}`;
  return { jti, adminUserId, targetUserId, expiresAt, signature: hmac(payload) };
}

/** Serialize to the compact string sent as header. */
export function serializeToken(t: ImpersonationToken): string {
  return `v1.${t.jti}.${t.adminUserId}.${t.targetUserId}.${t.expiresAt}.${t.signature}`;
}

/** Parse + verify; returns null on any tamper, expiry, or version mismatch. */
export function parseImpersonationToken(raw: string): ImpersonationToken | null {
  const parts = raw.split(".");
  if (parts.length !== 6) return null;
  const [version, jti, adminUserId, targetUserId, expStr, signature] = parts;
  if (version !== "v1") return null;
  const expiresAt = Number.parseInt(expStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const payload = `${adminUserId}:${targetUserId}:${jti}:${expiresAt}`;
  let expected: string;
  try {
    expected = hmac(payload);
  } catch {
    return null;
  }
  // Timing-safe compare
  const sigBuf = Buffer.from(signature, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return { jti, adminUserId, targetUserId, expiresAt, signature };
}

/** Default TTL so callers don't hard-code. */
export const IMPERSONATION_TTL_MS = DEFAULT_TTL_MS;
