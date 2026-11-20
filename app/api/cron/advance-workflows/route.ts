import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob, advanceWorkflows } from "@/lib/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isDryRun(request: NextRequest): boolean {
  const value = request.nextUrl.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

/**
 * Cron endpoint: Advance workflows
 * Runs every 5 minutes via Vercel Cron
 * Handles the expired-lease sweep (RA-7999), scheduled workflow activation,
 * READY task execution, and stale detection.
 * ?dryRun=1 reports what the sweep would reclaim and writes nothing.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // Dry-run must not write CronJobRun: a successful dry-run would otherwise
  // reset cron-watchdog staleness without advancing anything.
  if (isDryRun(request)) {
    const result = await advanceWorkflows({ dryRun: true });
    return NextResponse.json({ ...result, status: "dry-run" });
  }

  const result = await runCronJob("advance-workflows", () => advanceWorkflows());
  return NextResponse.json(result);
}
