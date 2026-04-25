/**
 * GET /api/cron/ubibot-poll
 *
 * Triggered by Vercel Cron (every 60 seconds) or Railway cron.
 * Polls all connected Ubibot channels and writes EnvironmentalData rows.
 *
 * RA-1613
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron";
import { pollUbibotSensors } from "@/lib/cron/ubibot-poll";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await pollUbibotSensors();
  return NextResponse.json(result);
}
