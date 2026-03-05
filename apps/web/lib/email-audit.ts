/**
 * Email Audit Logging
 * Tracks all email sends in the EmailAudit table for report-related emails,
 * and provides consistent console logging for all email types.
 */

import { prisma } from '@/lib/prisma'

interface EmailAuditEntry {
  userId: string
  reportId: string
  recipient: string
  success: boolean
  error?: string
  deliveryType: 'immediate' | 'scheduled'
}

/**
 * Log a report-related email send to the EmailAudit table.
 * Non-blocking — catches and logs errors internally.
 */
export async function logEmailAudit(entry: EmailAuditEntry): Promise<void> {
  try {
    await prisma.emailAudit.create({
      data: {
        userId: entry.userId,
        reportId: entry.reportId,
        recipient: entry.recipient,
        success: entry.success,
        error: entry.error,
        deliveryType: entry.deliveryType,
      },
    })
  } catch (err) {
    // Don't throw — audit logging should never break the primary operation
    console.error('[EmailAudit] Failed to log audit entry:', err)
  }
}

/**
 * Wrap a report email send with audit logging.
 * Returns the result of the email send function.
 */
export async function sendWithAudit<T>(
  sendFn: () => Promise<T>,
  auditData: Omit<EmailAuditEntry, 'success' | 'error'>
): Promise<T | null> {
  try {
    const result = await sendFn()
    await logEmailAudit({ ...auditData, success: true })
    return result
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await logEmailAudit({ ...auditData, success: false, error: errorMessage })
    console.error(`[EmailAudit] Email send failed for report ${auditData.reportId}:`, errorMessage)
    return null
  }
}
