import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { queueInvoiceSync } from '@/lib/integrations/sync-queue'
import { IntegrationProvider } from '@prisma/client'

/**
 * POST /api/invoices/[id]/retry-sync - Manually retry failed invoice sync
 *
 * Allows users to manually retry failed sync operations
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { provider } = body

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    // Validate provider
    const validProviders: IntegrationProvider[] = ['XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA']

    if (!validProviders.includes(provider as IntegrationProvider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      )
    }

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Check if integration exists and is connected
    const integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider: provider as IntegrationProvider,
        status: 'CONNECTED'
      }
    })

    if (!integration) {
      return NextResponse.json(
        { error: `${provider} integration not connected` },
        { status: 400 }
      )
    }

    // Queue the sync with HIGH priority (manual retry)
    const jobId = queueInvoiceSync(invoice.id, provider as IntegrationProvider, 'HIGH')

    // Create audit log
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: invoice.id,
        userId: session.user.id,
        action: 'sync_retry',
        description: `Manual retry of sync to ${provider}`,
        metadata: {
          provider,
          jobId
        }
      }
    })

    console.log(
      `[Retry Sync] User ${session.user.id} manually retrying sync for invoice ${invoice.id} to ${provider}`
    )

    return NextResponse.json({
      success: true,
      jobId,
      message: `Sync to ${provider} queued for retry`
    })
  } catch (error: any) {
    console.error('[Retry Sync] Error retrying sync:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to retry sync'
      },
      { status: 500 }
    )
  }
}
