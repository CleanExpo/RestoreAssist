/**
 * RA-1596 — secure public-token helpers for invoice share links.
 *
 * Prior generator used `inv_${invoice.id}_${Date.now()}` — predictable
 * and never-expired. Leak once, accessible forever. This replacement:
 *
 *   - Generates 32 random bytes (256 bits) → base64url → zero
 *     predictability from the invoice id or timestamp.
 *   - Stamps a 90-day expiry by default (configurable via
 *     INVOICE_PUBLIC_TOKEN_DAYS env var if a tenant wants shorter).
 *   - Returns a `rotatedAt` timestamp so the DB row can record every
 *     rotation event for audit.
 *
 * Public viewer routes MUST call `isPublicTokenValid()` before
 * serving — it checks presence, equality, and expiry in one call.
 */

import crypto from "crypto";

const DEFAULT_TTL_DAYS = 90;
const MAX_TTL_DAYS = 365;

function configuredTtlDays(): number {
  const raw = process.env.INVOICE_PUBLIC_TOKEN_DAYS;
  if (!raw) return DEFAULT_TTL_DAYS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_DAYS;
  return Math.min(n, MAX_TTL_DAYS);
}

export interface MintedPublicToken {
  token: string;
  expiresAt: Date;
  rotatedAt: Date;
}

/** Mint a fresh high-entropy public token with a default 90-day expiry. */
export function mintPublicToken(ttlDaysOverride?: number): MintedPublicToken {
  const ttl = ttlDaysOverride ?? configuredTtlDays();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000);
  return { token, expiresAt, rotatedAt: now };
}

/**
 * Constant-time comparison + expiry check. Expected `invoice` to be the
 * loaded row with `publicToken` + `publicTokenExpiresAt`; supplied is
 * whatever the user submitted on the URL.
 *
 * Returns { valid, reason } so viewers can log the specific failure
 * mode without leaking it to the requestor.
 */
export function isPublicTokenValid(
  invoice: {
    publicToken?: string | null;
    publicTokenExpiresAt?: Date | null;
  } | null,
  supplied: string | null | undefined,
): { valid: boolean; reason: "ok" | "missing" | "mismatch" | "expired" | "legacy_no_expiry" } {
  if (!invoice || !invoice.publicToken || !supplied) {
    return { valid: false, reason: "missing" };
  }
  // Timing-safe equality — bail early only when lengths differ so the
  // comparison is constant-time for equal-length inputs.
  const a = Buffer.from(invoice.publicToken);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "mismatch" };
  }
  if (!invoice.publicTokenExpiresAt) {
    // Legacy-token row. Accept for backward compatibility but the
    // caller can use this signal to prompt the inviter to rotate.
    return { valid: true, reason: "legacy_no_expiry" };
  }
  if (invoice.publicTokenExpiresAt.getTime() < Date.now()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, reason: "ok" };
}
