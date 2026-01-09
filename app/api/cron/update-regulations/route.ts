/**
 * Cron Job: Update Regulatory Documents
 *
 * GET /api/cron/update-regulations
 *
 * This endpoint is called by Vercel cron jobs to check and update regulatory documents
 * from official Australian government sources.
 *
 * Runs: Monthly on the 1st at 00:00 UTC (configured in vercel.json)
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from 'next/server'
import { regulatoryUpdateService, RegulatoryUpdateSummary } from '@/lib/regulatory-update-service'
import { logger } from '@/lib/logging'

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      logger.warn('[Update Regulations Cron] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('[Update Regulations Cron] Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    logger.info('[Update Regulations Cron] Starting regulatory document check')

    // Run the regulatory update service
    const updateSummary: RegulatoryUpdateSummary = await regulatoryUpdateService.checkForUpdates()

    // Log results
    logger.info('[Update Regulations Cron] Update complete', {
      status: updateSummary.status,
      documentsChecked: updateSummary.documentsChecked,
      documentsUpdated: updateSummary.documentsUpdated,
      documentsAdded: updateSummary.documentsAdded,
      errors: updateSummary.errors.length
    })

    // Cleanup obsolete documents
    try {
      const cleanedCount = await regulatoryUpdateService.cleanupObsoleteDocuments()
      logger.info('[Update Regulations Cron] Cleanup complete', {
        documentsRemoved: cleanedCount
      })
    } catch (cleanupError) {
      logger.error('[Update Regulations Cron] Cleanup failed', {
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      })
      // Don't fail the entire job if cleanup fails
    }

    // Return results
    return NextResponse.json(
      {
        status: updateSummary.status,
        message: `Regulatory document update complete. Checked ${updateSummary.documentsChecked}, updated ${updateSummary.documentsUpdated}, added ${updateSummary.documentsAdded}`,
        summary: {
          timestamp: updateSummary.timestamp,
          documentsChecked: updateSummary.documentsChecked,
          documentsUpdated: updateSummary.documentsUpdated,
          documentsAdded: updateSummary.documentsAdded,
          errors: updateSummary.errors
        },
        details: updateSummary.details
      },
      {
        status: updateSummary.status === 'failed' ? 500 : 200
      }
    )
  } catch (error) {
    logger.error('[Update Regulations Cron] Cron job failed', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      {
        status: 'error',
        error: 'Cron job failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Health check endpoint (GET without Authorization header)
 */
export async function HEAD(request: NextRequest) {
  return NextResponse.json({ status: 'ok' })
}
