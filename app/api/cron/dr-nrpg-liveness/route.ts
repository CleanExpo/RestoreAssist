import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { runDrNrpgLiveness } from "@/lib/cron/dr-nrpg-liveness";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: DR-NRPG integration liveness (RA-1287)
 * Runs daily at 04:30 UTC via Vercel Cron.
 * Pings each active DrNrpgIntegration with its stored API key and records
 * outcome. Deactivates integrations after sustained auth failure so dispatch
 * does not silently keep calling a dead key.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("dr-nrpg-liveness", runDrNrpgLiveness);
  return NextResponse.json(result);
}
