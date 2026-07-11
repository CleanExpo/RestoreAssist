/**
 * GET /api/cron/pricing-setup-reminders — RA-7026.
 *
 * Daily cron. Sends a one-time "set your charge-out rates" nudge to org owners
 * who are engaged but haven't configured pricing. Handler in
 * lib/cron/pricing-setup-reminders.ts; wrapped here in runCronJob for overlap
 * protection + audit trail (matches sibling crons). Dark by default — the
 * handler no-ops unless PRICING_REMINDER_ENABLED === "true".
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { sendPricingSetupReminders } from "@/lib/cron/pricing-setup-reminders";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const result = await runCronJob(
      "pricing-setup-reminders",
      sendPricingSetupReminders,
    );
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/pricing-setup-reminders] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
