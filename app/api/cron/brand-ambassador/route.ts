import { NextRequest, NextResponse } from "next/server";
import {
  verifyCronAuth,
  runCronJob,
  generateBrandAmbassadorDrafts,
} from "@/lib/cron";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Brand Ambassador — weekly social draft generation (RA-693)
 * Schedule: 0 8 * * 0  (Sunday 08:00 UTC = 18:00 AEST)
 *
 * Generates one LinkedIn post draft per active project using Claude Haiku,
 * then delivers each draft to Telegram for Phill's review before publishing.
import { verifyCronAuth } from "@/lib/cron/auth";
import { runBrandAmbassador } from "@/lib/cron/brand-ambassador";

/**
 * GET /api/cron/brand-ambassador — Weekly LinkedIn draft generator
 *
 * Called by Vercel Cron (Monday 08:00 AEST):  0 22 * * 0
 * Generates LinkedIn post drafts for each active project via Claude Haiku
 * and delivers them to Telegram for CEO review before posting.
 *
 * Idempotent — safe to retry; already-delivered weeks are skipped. */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob(
    "brand-ambassador",
    generateBrandAmbassadorDrafts,
  );
  return NextResponse.json(result);
try {
    const result = await runBrandAmbassador();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/brand-ambassador] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }}
