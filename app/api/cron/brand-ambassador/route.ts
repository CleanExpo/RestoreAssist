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
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob(
    "brand-ambassador",
    generateBrandAmbassadorDrafts,
  );
  return NextResponse.json(result);
}
