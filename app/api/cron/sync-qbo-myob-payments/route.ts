import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import {
  processQboMyobPendingPayments,
  retryUnresolvedQboMyobPayments,
} from "@/lib/integrations/webhook-processor";

/**
 * GET /api/cron/sync-qbo-myob-payments — QBO/MYOB payment reconciliation (RA-6984)
 *
 * Mirrors /api/cron/sync-xero-payments's two-phase shape for QUICKBOOKS/MYOB
 * payment.created webhook events, which (unlike XERO — resolved inline by
 * processWebhookEvent via processXeroWebhookBatch, RA-6965) had nothing
 * draining them:
 *
 *   1. processQboMyobPendingPayments — drains PENDING payment webhook events
 *      via the API-resolving handlePaymentCreated (resolves the real settled
 *      amount from the QBO Payments API / MYOB CustomerPayment API using the
 *      identifier the webhook stub carries, instead of trusting the stub).
 *   2. retryUnresolvedQboMyobPayments — retroactively re-attempts events
 *      RA-6974/#1699 marked SKIPPED with an "unresolvable stub" errorMessage
 *      from before this fix shipped.
 *
 * Secured by CRON_SECRET bearer token via verifyCronAuth (timing-safe comparison).
 * Integration rule: sync failures NEVER block user-facing operations. This
 * route always returns 200 with structured stats — never 5xx.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const jobResult = await runCronJob("sync-qbo-myob-payments", async () => {
    return await syncQboMyobPaymentsOnce();
  });

  return NextResponse.json({
    success: true,
    ...jobResult,
    timestamp: new Date().toISOString(),
  });
}

async function syncQboMyobPaymentsOnce() {
  const stats = {
    pendingProcessed: 0,
    pendingFailed: 0,
    pendingSkipped: 0,
    retroactiveProcessed: 0,
    retroactiveFailed: 0,
    retroactiveSkipped: 0,
  };

  // ── Phase 1: drain PENDING payment webhook events ────────────────────────
  try {
    const pendingResult = await processQboMyobPendingPayments(50);
    stats.pendingProcessed = pendingResult.processed;
    stats.pendingFailed = pendingResult.failed;
    stats.pendingSkipped = pendingResult.skipped;
  } catch (err) {
    console.error("[QBO/MYOB Payment Sync] Pending batch error:", err);
    // Non-fatal — continue to the retroactive phase
  }

  // ── Phase 2: retroactive pickup of #1699-marked unresolvable stubs ───────
  try {
    const retroResult = await retryUnresolvedQboMyobPayments(50);
    stats.retroactiveProcessed = retroResult.processed;
    stats.retroactiveFailed = retroResult.failed;
    stats.retroactiveSkipped = retroResult.skipped;
  } catch (err) {
    console.error("[QBO/MYOB Payment Sync] Retroactive batch error:", err);
  }

  return {
    itemsProcessed: stats.pendingProcessed + stats.retroactiveProcessed,
    metadata: stats,
  };
}

/**
 * POST /api/cron/sync-qbo-myob-payments — Manual trigger (same auth, useful for testing)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
