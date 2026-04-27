/**
 * GET /api/cron/override-governance
 *
 * RA-1390 / Motion M-15. Monthly cron: aggregates SOFT-gap overrides
 * from ProgressTransition.softGaps over the prior month and upserts
 * one OverrideGovernanceReport per gate.
 *
 * Schedule: 0 1 1 * *  (01:00 UTC on the 1st of each month) — registered
 * in vercel.json. Manual backfill: ?month=YYYY-MM.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { runOverrideGovernance } from "@/lib/cron/override-governance";

export async function GET(request: NextRequest) {
  const authFail = verifyCronAuth(request);
  if (authFail) return authFail;

  const monthParam = request.nextUrl.searchParams.get("month");
  let month: Date | undefined;
  if (monthParam) {
    const parsed = parseYearMonth(monthParam);
    if (!parsed) {
      return NextResponse.json(
        { error: "month must be YYYY-MM" },
        { status: 400 },
      );
    }
    month = parsed;
  }

  const result = await runCronJob("override-governance", async () => {
    const r = await runOverrideGovernance(month);
    return {
      itemsProcessed: r.rows.length,
      metadata: {
        breaches: r.rows.filter((row) => row.isBreached).length,
        month: (month ?? r.rows[0]?.reportMonth ?? new Date())
          .toISOString()
          .slice(0, 7),
      },
    };
  });

  return NextResponse.json(result);
}

function parseYearMonth(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return new Date(Date.UTC(year, monthIdx, 1));
}
