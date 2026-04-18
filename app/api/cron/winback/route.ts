/**
 * GET /api/cron/winback — RA-1242.
 *
 * Daily cron. Sends win-back email to users whose subscription expired ~30
 * days ago. Handler implementation in lib/cron/winback.ts; wrapped here in
 * runCronJob for overlap protection + audit trail (matches sibling crons).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { sendWinback } from "@/lib/cron/winback";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const result = await runCronJob("winback", sendWinback);
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/winback] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
