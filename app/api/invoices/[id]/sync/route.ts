import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDraft } from '@/lib/invoice-status'
import { syncInvoiceToXero } from '@/lib/integrations/xero'
import { syncInvoiceToQuickBooks } from '@/lib/integrations/quickbooks'
import { syncInvoiceToMYOB } from '@/lib/integrations/myob'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { provider } = body // "xero", "quickbooks", or "myob"

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required (xero, quickbooks, or myob)' },
        { status: 400 }
      )
    }

    // Fetch invoice with all related data
    const invoice = await prisma.invoice.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        },
        contact: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Can't sync draft invoices
    if (isDraft(invoice.status)) {
      return NextResponse.json(
        { error: 'Cannot sync draft invoices. Please send the invoice first.' },
        { status: 400 }
      )
    }

    // Check if integration is connected
    const integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider: provider.toUpperCase()
      }
    })

    if (!integration) {
      return NextResponse.json(
        { error: `No ${provider} integration found. Please connect to ${provider} first.` },
        { status: 404 }
      )
    }

    if (integration.status !== 'CONNECTED') {
      return NextResponse.json(
        { error: `${provider} integration is not connected. Please reconnect.` },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
      return NextResponse.json(
        { error: `${provider} access token has expired. Please reconnect.` },
        { status: 401 }
      )
    }

    // Update invoice sync status to PENDING
    await prisma.invoice.update({
      where: { id: params.id },
      data: {
        externalSyncStatus: 'PENDING',
        externalSyncProvider: provider.toLowerCase(),
        externalSyncError: null
      }
    })

    // Create audit log
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: params.id,
        userId: session.user.id,
        action: 'sync_initiated',
        description: `Started sync to ${provider}`,
        metadata: {
          provider
        }
      }
    })

    // Sync to accounting software based on provider
    let externalInvoiceId: string
    let syncResult: any

    try {
      switch (provider.toLowerCase()) {
        case 'xero':
          syncResult = await syncInvoiceToXero(invoice, integration)
          externalInvoiceId = syncResult.invoiceId
          break

        case 'quickbooks':
          syncResult = await syncInvoiceToQuickBooks(invoice, integration)
          externalInvoiceId = syncResult.invoiceId
          break

        case 'myob':
          syncResult = await syncInvoiceToMYOB(invoice, integration)
          externalInvoiceId = syncResult.invoiceId
          break

        default:
          throw new Error(`Unsupported provider: ${provider}`)
      }

      // Update invoice with external reference and success status
      await prisma.invoice.update({
        where: { id: params.id },
        data: {
          externalInvoiceId,
          externalSyncStatus: 'SYNCED',
          externalSyncedAt: new Date(),
          externalSyncError: null
        }
      })

      // Update integration last sync time
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          syncError: null
        }
      })

      // Create success audit log
      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: params.id,
          userId: session.user.id,
          action: 'sync_completed',
          description: `Successfully synced to ${provider}`,
          metadata: {
            provider,
            externalInvoiceId,
            ...syncResult
          }
        }
      })

      // Create integration sync log
      await prisma.integrationSyncLog.create({
        data: {
          integrationId: integration.id,
          syncType: 'INVOICE',
          status: 'SUCCESS',
          recordsProcessed: 1,
          recordsFailed: 0,
          completedAt: new Date()
        }
      })

      return NextResponse.json({
        success: true,
        message: `Invoice synced successfully to ${provider}`,
        externalInvoiceId,
        syncResult
      })
    } catch (syncError: any) {
      console.error(`Error syncing to ${provider}:`, syncError)

      // Update invoice with error status
      await prisma.invoice.update({
        where: { id: params.id },
        data: {
          externalSyncStatus: 'FAILED',
          externalSyncError: syncError.message || 'Unknown error'
        }
      })

      // Update integration with error
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncError: syncError.message || 'Sync failed'
        }
      })

      // Create error audit log
      await prisma.invoiceAuditLog.create({
        data: {
          invoiceId: params.id,
          userId: session.user.id,
          action: 'sync_failed',
          description: `Failed to sync to ${provider}: ${syncError.message}`,
          metadata: {
            provider,
            error: syncError.message
          }
        }
      })

      // Create integration sync log
      await prisma.integrationSyncLog.create({
        data: {
          integrationId: integration.id,
          syncType: 'INVOICE',
          status: 'FAILED',
          recordsProcessed: 0,
          recordsFailed: 1,
          errorMessage: syncError.message || 'Unknown error',
          completedAt: new Date()
        }
      })

      return NextResponse.json(
        {
          error: `Failed to sync to ${provider}: ${syncError.message}`,
          details: syncError.response?.data || syncError.message
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error in invoice sync:', error)
    return NextResponse.json(
      { error: 'Failed to sync invoice' },
      { status: 500 }
    )
  }
}

// GET - Check sync status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      select: {
        externalInvoiceId: true,
        externalSyncProvider: true,
        externalSyncStatus: true,
        externalSyncedAt: true,
        externalSyncError: true
      }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json({
      externalInvoiceId: invoice.externalInvoiceId,
      provider: invoice.externalSyncProvider,
      status: invoice.externalSyncStatus,
      syncedAt: invoice.externalSyncedAt,
      error: invoice.externalSyncError
    })
  } catch (error: any) {
    console.error('Error getting sync status:', error)
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}
