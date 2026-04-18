import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { runBrandAmbassador } from "@/lib/cron/brand-ambassador";

/**
 * GET /api/cron/brand-ambassador — Weekly LinkedIn draft generator
 *
 * Called by Vercel Cron (Monday 08:00 AEST):  0 22 * * 0
 * Generates LinkedIn post drafts for each active project via Claude Haiku
 * and delivers them to Telegram for CEO review before posting.
 *
 * Idempotent — safe to retry; already-delivered weeks are skipped.
 * RA-1315: wrapped in runCronJob for overlap protection + audit trail.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const result = await runCronJob("brand-ambassador", runBrandAmbassador);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/brand-ambassador] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
