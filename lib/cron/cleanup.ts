import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";

/**
 * Cleans up old data from various tables to prevent unbounded growth.
 *
 * **Retention windows are documented in `docs/compliance/DATA-RETENTION-POLICY.md`.**
 * If you add a new entity to this function, update the table in that doc
 * in the same PR. APP 11.2 requires destruction once data is no longer
 * needed — short operational TTLs here; business-critical records
 * (invoices / inspections / financial audit logs) are retained for 7
 * years per ATO + insurance norms and are NOT purged by this cron.
 *
 * Operational (purged by this cron):
 * - AgentTaskLog entries older than 30 days
 * - CronJobRun records older than 14 days
 * - Completed/failed/cancelled workflows older than 90 days
 * - Expired PasswordResetTokens (24 hours past expiry)
 * - Sent/failed ScheduledEmail records older than 30 days
 * - SecurityEvent records older than 90 days
 * - StripeWebhookEvent records older than 90 days (RA-1354)
 *
 * Business-critical (held, NOT purged here):
 * - Invoices, Estimates, Inspections, Reports, Audit logs
 *
 * @returns Result with total items cleaned and breakdown by table
 */
export async function cleanupOldData(): Promise<CronJobResult> {
  const now = Date.now();
  let totalCleaned = 0;
  const details: Record<string, number> = {};

  // 1. AgentTaskLog > 30 days
  const logCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const deletedLogs = await prisma.agentTaskLog.deleteMany({
    where: { timestamp: { lt: logCutoff } },
  });
  totalCleaned += deletedLogs.count;
  details.agentTaskLogs = deletedLogs.count;

  // 2. CronJobRun > 14 days
  const cronCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000);
  const deletedCronRuns = await prisma.cronJobRun.deleteMany({
    where: { startedAt: { lt: cronCutoff } },
  });
  totalCleaned += deletedCronRuns.count;
  details.cronJobRuns = deletedCronRuns.count;

  // 3. Completed workflows > 90 days
  const workflowCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const deletedWorkflows = await prisma.agentWorkflow.deleteMany({
    where: {
      status: { in: ["COMPLETED", "FAILED", "PARTIALLY_FAILED", "CANCELLED"] },
      completedAt: { lt: workflowCutoff },
    },
  });
  totalCleaned += deletedWorkflows.count;
  details.workflows = deletedWorkflows.count;

  // 4. Expired password reset tokens
  const tokenCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const deletedTokens = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: tokenCutoff } },
  });
  totalCleaned += deletedTokens.count;
  details.passwordResetTokens = deletedTokens.count;

  // 5. Old scheduled emails
  const emailCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const deletedEmails = await prisma.scheduledEmail.deleteMany({
    where: {
      status: { in: ["sent", "failed", "cancelled"] },
      updatedAt: { lt: emailCutoff },
    },
  });
  totalCleaned += deletedEmails.count;
  details.scheduledEmails = deletedEmails.count;

  // 6. Old security events
  const secCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const deletedSecEvents = await prisma.securityEvent.deleteMany({
    where: { createdAt: { lt: secCutoff } },
  });
  totalCleaned += deletedSecEvents.count;
  details.securityEvents = deletedSecEvents.count;

  // 7. RA-1354 — Stripe webhook events > 90 days.
  // Retained for replay + debug; past 90 days the dedupe index has long
  // since made any new dupes a P2002 (caught upstream) so the row's
  // value is zero. See DATA-RETENTION-POLICY.md for rationale.
  const stripeWebhookCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
  try {
    const deletedStripeWebhooks = await prisma.stripeWebhookEvent.deleteMany({
      where: { createdAt: { lt: stripeWebhookCutoff } },
    });
    totalCleaned += deletedStripeWebhooks.count;
    details.stripeWebhookEvents = deletedStripeWebhooks.count;
  } catch (err) {
    // Defensive — if the StripeWebhookEvent model doesn't exist yet in a
    // particular deployment, don't block the rest of the cleanup.
    console.error("[cron/cleanup] StripeWebhookEvent purge skipped:", err);
    details.stripeWebhookEvents = -1;
  }

  return { itemsProcessed: totalCleaned, metadata: details };
}
