import { NextRequest, NextResponse } from 'next/server'
import { processWebhookQueue, getQueueStats } from '@/lib/jobs/webhook-queue'

/**
 * POST /api/webhooks/process - Trigger webhook queue processing
 *
 * This endpoint can be called by:
 * - Vercel Cron (hourly or every 15 minutes)
 * - Manual trigger from admin dashboard
 * - External monitoring system
 *
 * Requires CRON_SECRET for security
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[Webhook Process] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      )
    }

    // Allow Bearer token or direct secret
    const providedSecret = authHeader?.replace('Bearer ', '')

    if (providedSecret !== cronSecret) {
      console.error('[Webhook Process] Invalid authorization')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Webhook Process] Processing webhook queue...')

    // Process the queue
    const result = await processWebhookQueue({
      batchSize: 20,
      maxConcurrent: 5
    })

    // Get updated stats
    const stats = await getQueueStats()

    return NextResponse.json({
      success: true,
      result,
      stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[Webhook Process] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/webhooks/process - Get webhook queue statistics
 *
 * Returns current queue status and statistics
 * Useful for monitoring dashboards
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Require authentication for GET as well
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret) {
      const providedSecret = authHeader?.replace('Bearer ', '')
      if (providedSecret !== cronSecret) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    const stats = await getQueueStats()

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[Webhook Process] Error getting stats:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error'
      },
      { status: 500 }
    )
  }
}
