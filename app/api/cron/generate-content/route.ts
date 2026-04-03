/**
 * GET /api/cron/generate-content
 *
 * Daily cron endpoint for the autonomous content pipeline.
 * Selects a topic, generates script + voiceover, submits video render.
 * Pipeline may take 2-3 minutes end-to-end.
 *
 * Authentication: CRON_SECRET bearer token (Vercel cron)
 *
 * Env vars required:
 *   CRON_SECRET                — Vercel cron auth
 *   CONTENT_SYSTEM_USER_ID    — System user ID for content jobs
 *   ANTHROPIC_API_KEY          — Claude API
 *   ELEVENLABS_API_KEY         — ElevenLabs TTS
 *   ELEVENLABS_VOICE_ID        — Voice ID
 *   HEYGEN_API_KEY             — HeyGen video
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service role
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob } from '@/lib/cron'
import { runContentPipeline } from '@/lib/content-pipeline/orchestrator'

export const maxDuration = 300 // 5 minutes — pipeline may take 2-3 min
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const systemUserId = process.env.CONTENT_SYSTEM_USER_ID
  if (!systemUserId) {
    return NextResponse.json(
      { error: 'CONTENT_SYSTEM_USER_ID is not configured' },
      { status: 500 }
    )
  }

  const result = await runCronJob('generate-content', async () => {
    const pipelineResult = await runContentPipeline(systemUserId)

    return {
      itemsProcessed: pipelineResult.jobId ? 1 : 0,
      metadata: {
        jobId: pipelineResult.jobId || null,
        finalStatus: pipelineResult.finalStatus,
      },
    }
  })

  return NextResponse.json(result)
}
