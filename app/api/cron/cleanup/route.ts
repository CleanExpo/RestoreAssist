import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob, cleanupOldData } from "@/lib/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Cleanup old data
 * Runs daily at 17:00 UTC (03:00 AEST) via Vercel Cron
 * Removes old logs, workflows, tokens, emails, and security events
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("cleanup", cleanupOldData);
  return NextResponse.json(result);
}
