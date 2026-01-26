/**
 * Sync Integration Route
 * POST /api/integrations/oauth/[provider]/sync
 * Triggers data sync for clients and/or jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from '@/lib/integrations/oauth-handler'
import { createClientForIntegration } from '@/lib/integrations'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { provider: providerParam } = await params
    const provider = providerParam.toUpperCase() as IntegrationProvider

    // Validate provider
    if (!PROVIDER_CONFIG[provider]) {
      return NextResponse.json(
        { error: `Invalid provider: ${providerParam}` },
        { status: 400 }
      )
    }

    // Find integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider,
        status: 'CONNECTED',
      },
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found or not connected' },
        { status: 404 }
      )
    }

    // Parse request body for sync type
    const body = await request.json().catch(() => ({}))
    const syncClients = body.syncClients !== false
    const syncJobs = body.syncJobs !== false

    // Update status to syncing
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'SYNCING' },
    })

    try {
      // Create client and sync
      const client = await createClientForIntegration(integration.id)

      let clientsCount = 0
      let jobsCount = 0

      if (syncClients) {
        clientsCount = await client.syncClients()
      }

      if (syncJobs) {
        jobsCount = await client.syncJobs()
      }

      // Update status back to connected
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: 'CONNECTED',
          lastSyncAt: new Date(),
          syncError: null,
        },
      })

      return NextResponse.json({
        success: true,
        clientsSynced: clientsCount,
        jobsSynced: jobsCount,
        message: `Synced ${clientsCount} clients and ${jobsCount} jobs from ${PROVIDER_CONFIG[provider].name}`,
      })
    } catch (syncError) {
      // Update status to error
      const errorMessage = syncError instanceof Error ? syncError.message : String(syncError)
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: 'ERROR',
          syncError: errorMessage,
        },
      })

      throw syncError
    }
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      {
        error: 'Sync failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
