/**
 * Punch-list P1 #11.2 — mirror-recovery cron route.
 *
 * Schedule: invoked by Vercel Cron (separate from the high-frequency
 * `/api/cron/storage-mirror` queue drain). This route walks the dead-letter
 * candidates — `StorageMirrorJob.status = FAILED` AND `attempts >= 5` —
 * and promotes + notifies once each. Idempotent by status filter.
 *
 * Auth: header `Authorization: Bearer ${CRON_SECRET}` via `verifyCronAuth`
 * — identical to other cron routes in the repo (CLAUDE.md rule #1
 * exception for `/api/cron/*`).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { fromException } from "@/lib/api-errors";
import { sweepDeadLetters } from "@/lib/lifecycle/subscribers/mirror-recovery";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const stats = await sweepDeadLetters();
    return NextResponse.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return fromException(request, err, { stage: "sweep" });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
