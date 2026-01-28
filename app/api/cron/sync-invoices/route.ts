import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queueInvoiceSync } from '@/lib/integrations/sync-queue'

/**
 * GET /api/cron/sync-invoices - Scheduled invoice sync cron job
 *
 * This endpoint should be called by:
 * - Vercel Cron (hourly): 0 * * * *
 * - Or external cron service
 *
 * Automatically syncs modified invoices to connected accounting systems
 *
 * Requires CRON_SECRET for security
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[Invoice Sync Cron] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      )
    }

    // Allow Bearer token or direct secret
    const providedSecret = authHeader?.replace('Bearer ', '')

    if (providedSecret !== cronSecret) {
      console.error('[Invoice Sync Cron] Invalid authorization')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Invoice Sync Cron] Starting scheduled invoice sync...')

    // Find all active integrations
    const integrations = await prisma.integration.findMany({
      where: {
        status: 'CONNECTED',
        provider: {
          in: ['XERO', 'QUICKBOOKS', 'MYOB']
        }
      },
      select: {
        id: true,
        provider: true,
        userId: true,
        lastSyncAt: true
      }
    })

    if (integrations.length === 0) {
      console.log('[Invoice Sync Cron] No active integrations found')
      return NextResponse.json({
        success: true,
        message: 'No active integrations',
        stats: {
          integrations: 0,
          invoicesQueued: 0
        }
      })
    }

    console.log(`[Invoice Sync Cron] Found ${integrations.length} active integrations`)

    let totalQueued = 0

    // For each integration, find invoices that need syncing
    for (const integration of integrations) {
      try {
        // Determine sync window (since last sync or last 24 hours)
        const syncWindow = integration.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000)

        // Find invoices modified since last sync
        const invoices = await prisma.invoice.findMany({
          where: {
            userId: integration.userId,
            status: {
              not: 'DRAFT' // Don't sync drafts
            },
            updatedAt: {
              gte: syncWindow
            },
            // Exclude invoices that were already synced to this provider
            // and haven't been modified since
            OR: [
              {
                externalInvoiceId: null // Never synced
              },
              {
                externalProvider: {
                  not: integration.provider // Synced to different provider
                }
              },
              {
                updatedAt: {
                  gte: integration.lastSyncAt || new Date(0) // Modified since last sync
                }
              }
            ]
          },
          select: {
            id: true,
            invoiceNumber: true,
            status: true
          },
          take: 50 // Limit to 50 per integration per run
        })

        if (invoices.length === 0) {
          console.log(
            `[Invoice Sync Cron] No invoices to sync for ${integration.provider} (user ${integration.userId})`
          )
          continue
        }

        console.log(
          `[Invoice Sync Cron] Queuing ${invoices.length} invoices for ${integration.provider}`
        )

        // Queue each invoice for sync
        for (const invoice of invoices) {
          try {
            // Use NORMAL priority for scheduled syncs
            queueInvoiceSync(invoice.id, integration.provider, 'NORMAL')
            totalQueued++
          } catch (error) {
            console.error(
              `[Invoice Sync Cron] Failed to queue invoice ${invoice.id}:`,
              error
            )
          }
        }

        // Update last sync time
        await prisma.integration.update({
          where: { id: integration.id },
          data: { lastSyncAt: new Date() }
        })
      } catch (error) {
        console.error(
          `[Invoice Sync Cron] Error processing integration ${integration.id}:`,
          error
        )
      }
    }

    console.log(`[Invoice Sync Cron] Completed: queued ${totalQueued} invoices`)

    return NextResponse.json({
      success: true,
      stats: {
        integrations: integrations.length,
        invoicesQueued: totalQueued
      },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[Invoice Sync Cron] Error:', error)
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
 * POST /api/cron/sync-invoices - Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  // Same logic as GET, allows manual triggering
  return GET(request)
}
