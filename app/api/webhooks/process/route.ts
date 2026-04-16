import { NextRequest, NextResponse } from "next/server";
import { processWebhookQueue, getQueueStats } from "@/lib/jobs/webhook-queue";
import { verifyCronAuth } from "@/lib/cron/auth";

/**
 * POST /api/webhooks/process - Trigger webhook queue processing
 *
 * This endpoint can be called by:
 * - Vercel Cron (hourly or every 15 minutes)
 * - Manual trigger from admin dashboard
 * - External monitoring system
 *
 * Requires CRON_SECRET for security
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    // Process the queue
    const result = await processWebhookQueue({
      batchSize: 20,
      maxConcurrent: 5,
    });

    // Get updated stats
    const stats = await getQueueStats();

    return NextResponse.json({
      success: true,
      result,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Webhook Process] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/webhooks/process - Get webhook queue statistics
 *
 * Returns current queue status and statistics
 * Useful for monitoring dashboards
 */
export async function GET(request: NextRequest) {
  try {
    // Always require CRON_SECRET — queue stats expose operational data
    const authResult = verifyCronAuth(request);
    if (authResult) return authResult;

    const stats = await getQueueStats();

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Webhook Process] Error getting stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}
