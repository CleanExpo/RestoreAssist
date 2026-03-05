/**
 * Security Event Audit Logging
 * Persists security events to the SecurityEvent table.
 * Non-blocking — catches and logs errors internally so it never
 * breaks the primary auth/API operation.
 */

import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'ACCOUNT_REGISTERED'
  | 'GOOGLE_SIGNIN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CSRF_REJECTED'

export type SecuritySeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface SecurityEventEntry {
  eventType: SecurityEventType
  severity?: SecuritySeverity
  userId?: string | null
  email?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  details?: Record<string, unknown>
}

/**
 * Log a security event to the database.
 * Non-blocking — catches errors internally.
 */
export async function logSecurityEvent(entry: SecurityEventEntry): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: entry.eventType,
        severity: entry.severity ?? 'INFO',
        userId: entry.userId ?? null,
        email: entry.email ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        details: entry.details ? JSON.stringify(entry.details) : null,
      },
    })
  } catch (err) {
    console.error('[SecurityAudit] Failed to log event:', err)
  }
}

/**
 * Extract IP and User-Agent from a NextRequest for audit logging.
 */
export function extractRequestContext(req: NextRequest): {
  ipAddress: string
  userAgent: string
} {
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'
  return { ipAddress, userAgent }
}
