import { NextRequest, NextResponse } from 'next/server'
import { cleanupExpiredFiles, cleanupOldFiles } from '@/lib/cron/cleanup-expired-files'
import { verifyCronAuth } from '@/lib/cron/auth'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function GET(request: NextRequest) {
  try {
    // Verify cron authentication
    const authResult = verifyCronAuth(request)
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.message },
        { status: 401 }
      )
    }

    console.log('[Cron API] Starting file cleanup jobs...')

    // Run expired files cleanup
    const expiredResult = await cleanupExpiredFiles()

    // Run old files cleanup (90+ days old temporary files)
    const oldResult = await cleanupOldFiles(90, ['temporary', 'export', 'preview'])

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        expired: expiredResult,
        old: oldResult
      }
    })
  } catch (error: any) {
    console.error('[Cron API] Error in cleanup job:', error)
    return NextResponse.json(
      {
        error: 'Cleanup job failed',
        message: error?.message || 'Unknown error'
      },
      { status: 500 }
    )
  }
}
