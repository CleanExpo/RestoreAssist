/**
 * External Clients Route
 * GET /api/integrations/oauth/[provider]/clients - List synced clients
 * POST /api/integrations/oauth/[provider]/clients - Import selected clients
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from '@/lib/integrations/oauth-handler'

export async function GET(
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

    // Get synced clients
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''

    const where = {
      integrationId: integration.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [clients, total] = await Promise.all([
      prisma.externalClient.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.externalClient.count({ where }),
    ])

    return NextResponse.json({
      clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Fetch clients error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}

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

    const body = await request.json()
    const { clientIds } = body

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json(
        { error: 'clientIds array is required' },
        { status: 400 }
      )
    }

    // Get external clients
    const externalClients = await prisma.externalClient.findMany({
      where: {
        integrationId: integration.id,
        externalId: { in: clientIds },
      },
    })

    // Import to contacts
    const imported: string[] = []
    const errors: Array<{ id: string; error: string }> = []

    for (const externalClient of externalClients) {
      try {
        // Create a client record
        const client = await prisma.client.create({
          data: {
            userId: session.user.id,
            name: externalClient.name,
            email: externalClient.email,
            phone: externalClient.phone,
            address: externalClient.address,
          },
        })

        // Link external client to the client record
        await prisma.externalClient.update({
          where: { id: externalClient.id },
          data: { contactId: client.id },
        })

        imported.push(externalClient.externalId)
      } catch (err) {
        errors.push({
          id: externalClient.externalId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      errors,
      message: `Imported ${imported.length} clients from ${PROVIDER_CONFIG[provider].name}`,
    })
  } catch (error) {
    console.error('Import clients error:', error)
    return NextResponse.json(
      { error: 'Failed to import clients' },
      { status: 500 }
    )
  }
}
