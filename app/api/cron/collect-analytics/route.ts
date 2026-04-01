import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob } from '@/lib/cron'
import { collectAnalytics } from '@/lib/cron/collect-analytics'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint: Collect YouTube analytics for posted content
 * Runs daily at noon AEST (02:00 UTC) via external cron scheduler
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const result = await runCronJob('collect-analytics', collectAnalytics)
  return NextResponse.json(result)
}
