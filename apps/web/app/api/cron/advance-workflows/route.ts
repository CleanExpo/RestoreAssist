import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, runCronJob, advanceWorkflows } from '@/lib/cron'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint: Advance workflows
 * Runs every 1 minute via Vercel Cron
 * Handles scheduled workflow activation, READY task execution, and stale detection
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const result = await runCronJob('advance-workflows', advanceWorkflows)
  return NextResponse.json(result)
}
