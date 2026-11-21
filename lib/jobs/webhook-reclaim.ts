import { prisma } from "@/lib/prisma";

/**
 * RA-8426 — the one owner of the stale-claim rule for WebhookEvent.
 *
 * Every drain claims a row by moving it to PROCESSING. If the run dies before
 * it records the outcome (function timeout, crash, or a failed second write
 * in a catch block), the row stays PROCESSING and no drain selects it again:
 * a paid invoice stays unpaid. Every scheduled drain calls this before it
 * selects its batch, so a dead claim expires.
 *
 * The age limit must stay above the longest a drain can hold one claim. Each
 * drain claims one event at a time, immediately before processing it, and
 * every provider call made while a claim is held has a time limit (Xero:
 * XERO_REQUEST_TIMEOUT_MS; QuickBooks and MYOB clients: 15 seconds), so a live
 * claim lasts seconds and 10 minutes leaves it alone. Production runs on
 * DigitalOcean, where the cron routes' `maxDuration` is not enforced; those
 * request time limits are the bound that holds there.
 *
 * Each reclaim counts as an attempt (`retryCount + 1`), using the same bound
 * as every other webhook retry path. WEBHOOK_MAX_RETRIES below is that one
 * bound (RA-8481): every comparison of a WebhookEvent retryCount imports it,
 * enforced by lib/jobs/__tests__/webhook-retry-limit-owner.test.ts. A row that kills its run every time
 * ends FAILED with retryCount at the bound, which retryFailedEvents does not
 * reset, so it cannot loop.
 */

export const WEBHOOK_STALE_CLAIM_MS = 10 * 60 * 1000;
export const WEBHOOK_MAX_RETRIES = 5;
export const WEBHOOK_RECLAIM_MESSAGE =
  "Processing was interrupted before it finished; the claim expired and the event was released for another attempt.";
export const WEBHOOK_RECLAIM_EXHAUSTED_MESSAGE =
  "Processing was interrupted before it finished on every attempt; retry limit reached.";

/**
 * RA-8481 — a reclaim that could not run. The drains that call the reclaim
 * sit inside cron routes that treat a drain error as non-fatal and carry on,
 * which would make a broken reclaim look like a successful run while dead
 * claims pile up. The routes rethrow this error so runCronJob records the run
 * failed and the route returns a failure.
 */
export class WebhookReclaimError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Webhook stale-claim reclaim failed: ${detail}`);
    this.name = "WebhookReclaimError";
    this.cause = cause;
  }
}

export async function reclaimStaleWebhookEvents(
  options: { staleAfterMs?: number; maxRetries?: number } = {},
): Promise<{ released: number; failed: number }> {
  try {
    return await reclaim(options);
  } catch (err) {
    throw err instanceof WebhookReclaimError ? err : new WebhookReclaimError(err);
  }
}

async function reclaim(
  options: { staleAfterMs?: number; maxRetries?: number },
): Promise<{ released: number; failed: number }> {
  const {
    staleAfterMs = WEBHOOK_STALE_CLAIM_MS,
    maxRetries = WEBHOOK_MAX_RETRIES,
  } = options;
  const staleBefore = new Date(Date.now() - staleAfterMs);

  // Last attempt used up: surface it as FAILED instead of releasing it.
  const exhausted = await prisma.webhookEvent.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: staleBefore },
      retryCount: { gte: maxRetries - 1 },
    },
    data: {
      status: "FAILED",
      errorMessage: WEBHOOK_RECLAIM_EXHAUSTED_MESSAGE,
      retryCount: { increment: 1 },
    },
  });

  const released = await prisma.webhookEvent.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: staleBefore },
      retryCount: { lt: maxRetries - 1 },
    },
    data: {
      status: "PENDING",
      errorMessage: WEBHOOK_RECLAIM_MESSAGE,
      retryCount: { increment: 1 },
    },
  });

  if (released.count > 0 || exhausted.count > 0) {
    console.warn(
      `[Webhook Reclaim] Expired stale PROCESSING claims: ${released.count} released to PENDING, ${exhausted.count} marked FAILED`,
    );
  }

  return { released: released.count, failed: exhausted.count };
}
