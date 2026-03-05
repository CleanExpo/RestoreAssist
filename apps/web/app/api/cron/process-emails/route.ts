import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob, processScheduledEmails } from '@/lib/cron'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint: Process scheduled emails
 * Runs every 1 minute via Vercel Cron
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const result = await runCronJob('process-emails', processScheduledEmails)
  return NextResponse.json(result)
}
