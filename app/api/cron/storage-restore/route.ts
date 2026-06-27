/**
 * SP-T Block 7: Storage restore cron route.
 *
 * Schedule: every minute (`* * * * *` in vercel.json — Vercel hobby plan
 * minimum granularity is 1 min). Drains the StorageRestoreJob queue.
 *
 * Auth: header `Authorization: Bearer ${CRON_SECRET}` via
 *       `verifyCronAuth` — identical to other cron routes in the repo.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { processNextRestoreBatch } from "@/lib/queue/storage-restore";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const stats = await processNextRestoreBatch({ maxJobs: 50 });
    return NextResponse.json({
      success: true,
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Storage Restore Cron] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
