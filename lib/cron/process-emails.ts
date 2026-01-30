import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { logEmailAudit } from '@/lib/email-audit'
import type { CronJobResult } from './runner'

const BATCH_SIZE = 20
const MAX_ATTEMPTS = 3

/**
 * Processes pending ScheduledEmail records whose scheduledAt time has arrived.
 * Sends emails via Resend and updates status accordingly.
 *
 * @returns Result with count of emails processed and send/fail breakdown
 */
export async function processScheduledEmails(): Promise<CronJobResult> {
  const now = new Date()

  const emails = await prisma.scheduledEmail.findMany({
    where: {
      status: 'pending',
      scheduledAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH_SIZE,
    include: {
      report: { select: { id: true, title: true, clientName: true } },
      user: { select: { id: true, email: true } },
    },
  })

  if (emails.length === 0) {
    return { itemsProcessed: 0 }
  }

  let sent = 0
  let failed = 0

  for (const email of emails) {
    // Mark as sending
    await prisma.scheduledEmail.update({
      where: { id: email.id },
      data: { status: 'sending', lastAttempt: now, attempts: email.attempts + 1 },
    })

    try {
      const resend = new Resend(process.env.RESEND_API_KEY!)
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'RestoreAssist <noreply@restoreassist.com>',
        to: email.recipient,
        subject: email.subject || `Report: ${email.report.title}`,
        html: email.htmlBody || generateDefaultEmailHtml(email),
        text: email.textBody || undefined,
      })

      await prisma.scheduledEmail.update({
        where: { id: email.id },
        data: { status: 'sent', sentAt: new Date() },
      })

      await logEmailAudit({
        userId: email.userId,
        reportId: email.reportId,
        recipient: email.recipient,
        success: true,
        deliveryType: 'scheduled',
      })

      sent++
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const newStatus = email.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending'

      await prisma.scheduledEmail.update({
        where: { id: email.id },
        data: { status: newStatus, error: errorMsg },
      })

      await logEmailAudit({
        userId: email.userId,
        reportId: email.reportId,
        recipient: email.recipient,
        success: false,
        error: errorMsg,
        deliveryType: 'scheduled',
      })

      failed++
    }
  }

  return {
    itemsProcessed: emails.length,
    metadata: { sent, failed },
  }
}

function generateDefaultEmailHtml(email: any): string {
  return `<p>Your report "${email.report.title}" for ${email.report.clientName} is ready.</p>`
}
