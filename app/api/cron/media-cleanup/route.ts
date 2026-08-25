import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { retryMediaCleanupTasks } from "@/lib/cron/media-cleanup";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    const result = await runCronJob("media-cleanup", retryMediaCleanupTasks);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/media-cleanup] failed", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
