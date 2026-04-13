/**
 * GET /api/cron/scout
 *
 * Weekly Scout Agent cron — fires Monday 23:00 UTC (Monday 9am AEST).
 * Gathers external intelligence from GitHub, ArXiv, and Hacker News,
 * scores each finding against ZTE dimensions, and files relevant
 * findings as Linear issues with the `scout` label for board review.
 *
 * Authentication: CRON_SECRET bearer token (Vercel cron)
 *
 * Env vars required:
 *   CRON_SECRET        — Vercel cron auth
 *   ANTHROPIC_API_KEY  — Claude Haiku for ZTE relevance scoring
 *   LINEAR_API_KEY     — Linear issue creation
 *
 * Optional overrides (defaults to hardcoded RA team UUIDs):
 *   LINEAR_RA_TEAM_ID
 *   LINEAR_SCOUT_LABEL_ID
 *   LINEAR_RA_TODO_STATE_ID
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { runScoutAgent } from "@/lib/cron/scout-agent";

export const maxDuration = 300; // 5 minutes — external API calls may be slow
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("scout-agent", async () => {
    const scoutResult = await runScoutAgent();

    return {
      itemsProcessed: scoutResult.issuesCreated,
      metadata: {
        findingsCollected: scoutResult.findingsCollected,
        findingsScored: scoutResult.findingsScored,
        issuesCreated: scoutResult.issuesCreated,
        sources: scoutResult.sources,
      },
    };
  });

  return NextResponse.json(result);
}
