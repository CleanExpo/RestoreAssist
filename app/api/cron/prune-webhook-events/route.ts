import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { pruneWebhookEvents } from "@/lib/cron/prune-webhook-events";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Prune webhook audit rows older than 90 days (RA-1328).
 * Runs daily at 17:30 UTC (03:30 AEST) — off-peak, after the main cleanup
 * cron at 17:00 UTC (03:00 AEST).
 *
 * Batched deletion (20×1000 rows max per run) to avoid blocking VACUUM.
 * If backlog exceeds 20k rows, next day's run continues cleanup.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("prune-webhook-events", pruneWebhookEvents);
  return NextResponse.json(result);
}
