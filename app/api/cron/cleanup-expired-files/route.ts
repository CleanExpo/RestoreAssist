import { NextRequest, NextResponse } from "next/server";
import {
  cleanupExpiredFiles,
  cleanupOldFiles,
} from "@/lib/cron/cleanup-expired-files";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { fromException } from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/cleanup-expired-files — Daily Cloudinary TTL + age prune (RA-7453)
 *
 * Scheduled in vercel.json as `0 16 * * *` (02:00 AEST). Deletes raw files
 * tagged temporary/export/attachment/preview whose context.expires_at has
 * passed, then prunes temporary/export/preview files older than 90 days.
 *
 * Wrapped in runCronJob so CronJobRun rows feed the watchdog.
 * Auth: CRON_SECRET via verifyCronAuth.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = verifyCronAuth(request);
    if (authResult !== null) {
      return authResult;
    }

    const jobResult = await runCronJob(
      "cleanup-expired-files",
      cleanupExpiredFilesOnce,
    );

    return NextResponse.json({
      success: true,
      ...jobResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return fromException(request, error, { stage: "cleanup" });
  }
}

async function cleanupExpiredFilesOnce() {
  const expiredResult = await cleanupExpiredFiles();
  const oldResult = await cleanupOldFiles(90, [
    "temporary",
    "export",
    "preview",
  ]);

  const deleted =
    (expiredResult.stats?.deleted ?? 0) + (oldResult.stats?.deleted ?? 0);

  return {
    itemsProcessed: deleted,
    metadata: {
      expired: expiredResult,
      old: oldResult,
    },
  };
}
