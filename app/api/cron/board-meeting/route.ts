/**
 * GET /api/cron/board-meeting
 *
 * Weekly automated CEO Board meeting cron.
 * Fires Tuesday 00:00 UTC — one hour after Scout Agent (Mon 23:00 UTC),
 * so scout findings are available for Phase 1 intelligence gathering.
 *
 * Authentication: CRON_SECRET bearer token (Vercel cron)
 *
 * Env vars required:
 *   CRON_SECRET        — Vercel cron auth
 *   ANTHROPIC_API_KEY  — Claude Opus for 9-persona deliberation
 *   LINEAR_API_KEY     — Read scout findings + create action items
 *
 * Optional:
 *   TELEGRAM_BOT_TOKEN — CEO summary delivery
 *   TELEGRAM_CHAT_ID   — Target chat/channel
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, runCronJob } from "@/lib/cron";
import { runBoardMeeting } from "@/lib/cron/board-meeting";

export const maxDuration = 300; // 5 minutes — Opus deliberation may take 2-3 min
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await runCronJob("board-meeting", async () => {
    const meetingResult = await runBoardMeeting();

    return {
      itemsProcessed: meetingResult.actionItemsCreated,
      metadata: {
        date: meetingResult.date,
        intelligenceGathered: meetingResult.intelligenceGathered,
        deliberationRan: meetingResult.deliberationRan,
        actionItemsCreated: meetingResult.actionItemsCreated,
        telegramSent: meetingResult.telegramSent,
        memoLength: meetingResult.memoLength,
      },
    };
  });

  return NextResponse.json(result);
}
