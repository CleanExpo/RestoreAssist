/**
 * prune-webhook-events.ts — RA-1328 / RA-1234 — delete old audit rows.
 *
 * StripeWebhookEvent, WebhookEvent, and IntegrationSyncLog store full
 * payloads / error text with no retention policy.
 *
 * Retention:
 *   StripeWebhookEvent — 90 days across all statuses.
 *   WebhookEvent (Xero/QBO/MYOB/ServiceM8) — 90 days across all statuses.
 *   IntegrationSyncLog — SUCCESS/PARTIAL: 90 days; FAILED: 180 days
 *     (keep failures longer for debugging sync issues).
 *
 * Deletion is batched to avoid long-running transactions that block
 * Postgres VACUUM / other writers.
 */
import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";

const RETENTION_DAYS = 90;
const RETENTION_DAYS_FAILED = 180; // keep FAILED rows longer for debugging
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 20; // cap at 20k rows per cron invocation

export async function pruneWebhookEvents(): Promise<CronJobResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffFailed = new Date(
    Date.now() - RETENTION_DAYS_FAILED * 24 * 60 * 60 * 1000,
  );

  let stripeDeleted = 0;
  let genericDeleted = 0;
  let syncLogDeleted = 0;

  // Prune StripeWebhookEvent batch-by-batch.
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const stale = await prisma.stripeWebhookEvent.findMany({
      where: { receivedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (stale.length === 0) break;
    const result = await prisma.stripeWebhookEvent.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    stripeDeleted += result.count;
    if (stale.length < BATCH_SIZE) break;
  }

  // Prune WebhookEvent batch-by-batch.
  // Uses createdAt since that's the insert timestamp on this model.
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const stale = await prisma.webhookEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (stale.length === 0) break;
    const result = await prisma.webhookEvent.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    genericDeleted += result.count;
    if (stale.length < BATCH_SIZE) break;
  }

  // RA-1234: Prune IntegrationSyncLog — SUCCESS/PARTIAL at 90d, FAILED at 180d.
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const stale = await prisma.integrationSyncLog.findMany({
      where: {
        OR: [
          { status: { not: "FAILED" }, startedAt: { lt: cutoff } },
          { status: "FAILED", startedAt: { lt: cutoffFailed } },
        ],
      },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (stale.length === 0) break;
    const result = await prisma.integrationSyncLog.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    syncLogDeleted += result.count;
    if (stale.length < BATCH_SIZE) break;
  }

  return {
    itemsProcessed: stripeDeleted + genericDeleted + syncLogDeleted,
    metadata: {
      retentionDays: RETENTION_DAYS,
      retentionDaysForFailed: RETENTION_DAYS_FAILED,
      stripeDeleted,
      genericDeleted,
      syncLogDeleted,
      cutoff: cutoff.toISOString(),
    },
  };
}
