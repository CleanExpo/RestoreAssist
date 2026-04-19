import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { refreshGoogleTokens } from "@/lib/cron/google-token-refresh";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Cron endpoint: Google OAuth refresh-token exerciser (RA-1271)
 *
 * Google refresh tokens can be invalidated after 6 months of inactivity.
 * This cron iterates every Google `Account` row with a stored refresh_token
 * and calls Google's /token endpoint weekly, which updates the refresh
 * token's "last used" marker and prevents the 6-month invalidation.
 *
 * Schedule: weekly, Sunday 05:00 UTC. Off-peak + plenty of margin before
 * the 6-month deadline.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("google-token-refresh", refreshGoogleTokens);
  return NextResponse.json(result);
}
