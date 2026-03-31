import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob } from '@/lib/cron'
import { pollHeygenRenders } from '@/lib/cron/poll-heygen'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint: Poll HeyGen for completed video renders
 * Runs every 5 minutes via external cron scheduler
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const result = await runCronJob('poll-heygen', pollHeygenRenders)
  return NextResponse.json(result)
}
