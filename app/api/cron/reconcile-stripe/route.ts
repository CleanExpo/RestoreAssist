/**
 * GET /api/cron/reconcile-stripe — RA-6939.
 *
 * Reconciliation safety net for Stripe cancellations. Lists locally-active
 * subscriptions, checks their real status in Stripe, and downgrades any that
 * Stripe reports canceled/deleted. Handler in lib/cron/reconcile-stripe.ts;
 * wrapped here in runCronJob for overlap protection + audit trail (matches
 * sibling crons).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { reconcileStripe } from "@/lib/cron/reconcile-stripe";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const result = await runCronJob("reconcile-stripe", reconcileStripe);
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/reconcile-stripe] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
