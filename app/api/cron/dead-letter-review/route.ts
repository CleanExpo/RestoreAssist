import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob, reviewDeadLetterTasks } from '@/lib/cron'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint: Dead letter review
 * Runs every 15 minutes via Vercel Cron
 * Re-queues dead letter tasks with transient errors for retry
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const result = await runCronJob('dead-letter-review', reviewDeadLetterTasks)
  return NextResponse.json(result)
}
