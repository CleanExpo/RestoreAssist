import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { retryFailedEvents } from "@/lib/jobs/webhook-queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/retry-failed-webhooks — Auto-retry FAILED webhook events.
 *
 * RA-6974: processXeroWebhookBatch (and the other provider processors) mark
 * a webhook event FAILED on first error with nothing to bring it back to
 * PENDING — retryFailedEvents existed but had zero callers, so a transient
 * failure (e.g. a momentary Xero API blip) permanently stopped that event
 * being reconciled. This regressed the old generic processor's behaviour of
 * retrying transient failures up to 5x with backoff.
 *
 * Bounded to 5 attempts via retryCount (see retryFailedEvents) so a
 * permanently-broken event does not retry forever.
 *
 * Runs every 30 minutes (vercel.json) so a Xero event reset here is picked
 * up by the next sync-xero-payments poll (which runs every 15 minutes).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("retry-failed-webhooks", async () => {
    const count = await retryFailedEvents({ maxRetries: 5 });
    return { itemsProcessed: count };
  });

  return NextResponse.json(result);
}
