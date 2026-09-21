import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { sendTrialReminders } from "@/lib/cron/trial-reminders";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isDryRun(request: NextRequest): boolean {
  const value = request.nextUrl.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

/**
 * Cron endpoint: Trial expiry reminders.
 * Live host (RA-7597 / D-024): GitHub Actions daily 22:00 UTC against
 * https://restoreassist.app. Vercel cron still hits the sandbox project.
 * Welcome emails and the founder sign-up alert are not invoked here.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // Dry-run must not write CronJobRun. A successful dry-run would otherwise
  // reset cron-watchdog staleness without sending any mail.
  if (isDryRun(request)) {
    const result = await sendTrialReminders({ dryRun: true });
    return NextResponse.json({ ...result, status: "dry-run" });
  }

  const result = await runCronJob("trial-reminders", sendTrialReminders);
  return NextResponse.json(result);
}
