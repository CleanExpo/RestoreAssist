/**
 * prune-webhook-events.ts — RA-1328 — delete old webhook audit rows.
 *
 * StripeWebhookEvent and WebhookEvent store full payloads in @db.Text /
 * Json columns and have no retention policy. At 10k active paying users,
 * 1M events/month × ~10 KB ≈ 10 GB/month of unbounded audit growth.
 *
 * Retention:
 *   StripeWebhookEvent — 90 days. PROCESSED rows just audit; FAILED rows
 *     need longer but we keep 90d across all statuses for consistency.
 *     Stripe's own dashboard retains event data for 30d, so 90d is a
 *     generous buffer for ad-hoc investigations.
 *   WebhookEvent (Xero/QBO/MYOB/ServiceM8) — 90 days across all statuses.
 *
 * Deletion is batched to avoid long-running transactions that block
 * Postgres VACUUM / other writers.
 */
import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";

const RETENTION_DAYS = 90;
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 20; // cap at 20k rows per cron invocation

export async function pruneWebhookEvents(): Promise<CronJobResult> {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  let stripeDeleted = 0;
  let genericDeleted = 0;

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

  return {
    itemsProcessed: stripeDeleted + genericDeleted,
    metadata: {
      retentionDays: RETENTION_DAYS,
      stripeDeleted,
      genericDeleted,
      cutoff: cutoff.toISOString(),
    },
  };
}
