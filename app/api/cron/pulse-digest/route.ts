import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { runPulseDigest } from "@/lib/cron/pulse-digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Restoration Pulse daily digest + 20-business-day Code of
 * Practice update (RA-6951, epic RA-6948).
 * Runs daily at 21:00 UTC (07:00 AEST / 08:00 AEDT) via Vercel Cron.
 *
 * This is the dispatcher's activation: from this cron's first run, any job
 * with Inspection.pulseEnabled=true actually emails its client daily. The
 * fleet-wide default stays OFF (pulseEnabled defaults to false) — a firm
 * must opt a job in. CRON_SECRET must be set in prod for this route to run
 * at all (verifyCronAuth fails closed otherwise).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("pulse-digest", runPulseDigest);
  return NextResponse.json(result);
}
