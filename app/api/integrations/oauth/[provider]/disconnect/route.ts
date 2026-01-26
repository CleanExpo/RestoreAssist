/**
 * Disconnect Integration Route
 * POST /api/integrations/oauth/[provider]/disconnect
 * Disconnects an integration and clears tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  disconnectIntegration,
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from '@/lib/integrations/oauth-handler'

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
      },
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    // Disconnect integration
    await disconnectIntegration(integration.id)

    // Optionally delete external data
    const body = await request.json().catch(() => ({}))
    if (body.deleteData) {
      await prisma.externalClient.deleteMany({
        where: { integrationId: integration.id },
      })
      await prisma.externalJob.deleteMany({
        where: { integrationId: integration.id },
      })
    }

    return NextResponse.json({
      success: true,
      message: `${PROVIDER_CONFIG[provider].name} disconnected successfully`,
    })
  } catch (error) {
    console.error('Disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect integration' },
      { status: 500 }
    )
  }
}
