/**
 * Security Event Audit Logging
 * Persists security events to the SecurityEvent table.
 * Non-blocking — catches and logs errors internally so it never
 * breaks the primary auth/API operation.
 */

import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "ACCOUNT_REGISTERED"
  | "ACCOUNT_DELETED"
  | "GOOGLE_SIGNIN"
  | "RATE_LIMIT_EXCEEDED"
  | "CSRF_REJECTED"
  // RA-1593 — global session revoke. JWT rotation picks this up on the
  // next refresh (max 24h lag given `updateAge: 86400`).
  | "SESSIONS_REVOKED";

export type SecuritySeverity = "INFO" | "WARNING" | "CRITICAL";

export interface SecurityEventEntry {
  eventType: SecurityEventType;
  severity?: SecuritySeverity;
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Log a security event to the database.
 * Non-blocking — catches errors internally.
 */
export async function logSecurityEvent(
  entry: SecurityEventEntry,
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: entry.eventType,
        severity: entry.severity ?? "INFO",
        userId: entry.userId ?? null,
        email: entry.email ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        details: entry.details ? JSON.stringify(entry.details) : null,
      },
    });
  } catch (err) {
    console.error("[SecurityAudit] Failed to log event:", err);
  }
}

/**
 * RA-1590 — account-lockout helper.
 *
 * Counts recent LOGIN_FAILED events against the given account identifier
 * (userId OR email) and returns a lockout decision. We count failures
 * in a rolling window so an attacker who spreads attempts across hours
 * isn't denied, but a rapid brute-force burst is.
 *
 * Intentionally stateless beyond SecurityEvent rows:
 *   - Uses the existing persistent audit log (RA-1260) — no new column
 *     on User, no migration, no P3009 risk.
 *   - Lockout-success wipes by writing a LOGIN_SUCCESS event which
 *     shifts the "recent" window past the failures on the next check.
 *   - Legitimate user who fat-fingers once or twice doesn't hit the
 *     cap; an attacker who fires 5+ within 15min does.
 *
 * Defaults (5 fails / 15min → 15min lockout) are conservative enough
 * that a real user who forgot their password still has runway.
 */
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockoutStatus {
  locked: boolean;
  /** Seconds remaining until the lockout expires; null if not locked. */
  retryAfterSeconds: number | null;
  /** How many failures within the rolling window. */
  recentFailures: number;
}

export async function getAccountLockoutStatus(args: {
  userId?: string;
  email?: string;
}): Promise<LockoutStatus> {
  if (!args.userId && !args.email) {
    return { locked: false, retryAfterSeconds: null, recentFailures: 0 };
  }

  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  try {
    const recent = await prisma.securityEvent.findMany({
      where: {
        eventType: "LOGIN_FAILED",
        createdAt: { gte: since },
        OR: [
          ...(args.userId ? [{ userId: args.userId }] : []),
          ...(args.email ? [{ email: args.email }] : []),
        ],
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: LOCKOUT_THRESHOLD + 1,
    });

    if (recent.length < LOCKOUT_THRESHOLD) {
      return {
        locked: false,
        retryAfterSeconds: null,
        recentFailures: recent.length,
      };
    }

    // Lockout window anchors on the Nth most recent failure — the one
    // that first crossed the threshold. When that timestamp is older
    // than LOCKOUT_DURATION_MS the lockout has expired.
    const anchor = recent[LOCKOUT_THRESHOLD - 1];
    const elapsedMs = Date.now() - anchor.createdAt.getTime();
    if (elapsedMs >= LOCKOUT_DURATION_MS) {
      return {
        locked: false,
        retryAfterSeconds: null,
        recentFailures: recent.length,
      };
    }
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((LOCKOUT_DURATION_MS - elapsedMs) / 1000),
      recentFailures: recent.length,
    };
  } catch (err) {
    // Fail-open on a DB hiccup — better to let a legit user through
    // than to chain-lock the whole tenant on a transient Prisma error.
    console.error("[SecurityAudit] lockout check failed, failing open:", err);
    return { locked: false, retryAfterSeconds: null, recentFailures: 0 };
  }
}

/**
 * Extract IP and User-Agent from a NextRequest for audit logging.
 */
export function extractRequestContext(req: NextRequest): {
  ipAddress: string;
  userAgent: string;
} {
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  return { ipAddress, userAgent };
}
