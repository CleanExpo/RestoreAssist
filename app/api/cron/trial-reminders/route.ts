import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { sendTrialReminders } from "@/lib/cron/trial-reminders";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Trial expiry reminders.
 * Runs daily at 8 AM UTC (~6 PM AEST) via Vercel Cron.
 * Closes RA-1240.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("trial-reminders", sendTrialReminders);
  return NextResponse.json(result);
}
