import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob } from '@/lib/cron'
import { distributeContent } from '@/lib/cron/distribute-content'

export const maxDuration = 300 // YouTube upload can take time
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint: Distribute completed videos to YouTube
 * Runs every 15 minutes via external cron scheduler
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const result = await runCronJob('distribute-content', distributeContent)
  return NextResponse.json(result)
}
