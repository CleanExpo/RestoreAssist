/**
 * GET /api/cron/deskilling-audit
 *
 * Monthly Vercel Cron — runs blind Claude review of 40 sampled inspections
 * and stores Tier 1/3/4 KPI results in CronJobRun metadata.
 *
 * RA-1135
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron";
import { runDeskillingScorecardAudit } from "@/lib/deskilling-scorecard/audit-automation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runDeskillingScorecardAudit();
  return NextResponse.json(result);
}
