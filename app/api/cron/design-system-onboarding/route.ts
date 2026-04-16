import { NextRequest, NextResponse } from "next/server";
import {
  verifyCronAuth,
  runCronJob,
  checkDesignSystemOnboarding,
} from "@/lib/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Design System Onboarding check (RA-693)
 * Schedule: 0 23 * * *  (daily 23:00 UTC = 09:00 AEST)
 *
 * Queries Linear for projects created in the last 7 days that have not yet
 * had a design system brief raised. Sends a Telegram prompt for each one.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob(
    "design-system-onboarding",
    checkDesignSystemOnboarding,
  );
  return NextResponse.json(result);
}
