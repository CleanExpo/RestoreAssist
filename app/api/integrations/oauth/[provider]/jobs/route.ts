/**
 * External Jobs Route
 * GET /api/integrations/oauth/[provider]/jobs - List synced jobs
 * POST /api/integrations/oauth/[provider]/jobs - Import selected jobs as claims
 *
 * REQUIRES: Active paid subscription
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from '@/lib/integrations/oauth-handler'
import {
  checkIntegrationAccess,
  createSubscriptionRequiredResponse,
} from '@/lib/integrations/subscription-guard'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription status - external integrations require paid subscription
    const subscriptionCheck = await checkIntegrationAccess(session.user.id)
    if (!subscriptionCheck.isAllowed) {
      return NextResponse.json(
        createSubscriptionRequiredResponse(subscriptionCheck),
        { status: 403 }
      )
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

    // Get synced jobs
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const where = {
      integrationId: integration.id,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { address: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    }

    const [jobs, total] = await Promise.all([
      prisma.externalJob.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastSyncedAt: 'desc' },
      }),
      prisma.externalJob.count({ where }),
    ])

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Fetch jobs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
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

    // Check subscription status - external integrations require paid subscription
    const subscriptionCheck = await checkIntegrationAccess(session.user.id)
    if (!subscriptionCheck.isAllowed) {
      return NextResponse.json(
        createSubscriptionRequiredResponse(subscriptionCheck),
        { status: 403 }
      )
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
    const { jobIds } = body

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json(
        { error: 'jobIds array is required' },
        { status: 400 }
      )
    }

    // Get external jobs
    const externalJobs = await prisma.externalJob.findMany({
      where: {
        integrationId: integration.id,
        externalId: { in: jobIds },
      },
    })

    // Import to reports/claims
    const imported: string[] = []
    const errors: Array<{ id: string; error: string }> = []

    for (const externalJob of externalJobs) {
      try {
        // Find linked client if exists
        let clientId: string | undefined
        if (externalJob.clientExternalId) {
          const linkedClient = await prisma.externalClient.findFirst({
            where: {
              integrationId: integration.id,
              externalId: externalJob.clientExternalId,
            },
          })
          clientId = linkedClient?.contactId || undefined
        }

        // Create a report for this job
        const report = await prisma.report.create({
          data: {
            userId: session.user.id,
            clientId,
            title: externalJob.title,
            description: externalJob.description || '',
            address: externalJob.address || '',
            status: mapExternalStatusToReportStatus(externalJob.status),
            jobType: 'WATER_DAMAGE', // Default - can be updated
          },
        })

        // Link external job to the report
        await prisma.externalJob.update({
          where: { id: externalJob.id },
          data: { claimId: report.id },
        })

        imported.push(externalJob.externalId)
      } catch (err) {
        errors.push({
          id: externalJob.externalId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      errors,
      message: `Imported ${imported.length} jobs as reports from ${PROVIDER_CONFIG[provider].name}`,
    })
  } catch (error) {
    console.error('Import jobs error:', error)
    return NextResponse.json(
      { error: 'Failed to import jobs' },
      { status: 500 }
    )
  }
}

function mapExternalStatusToReportStatus(externalStatus: string | null): string {
  if (!externalStatus) return 'DRAFT'

  const statusMap: Record<string, string> = {
    QUOTE: 'DRAFT',
    DRAFT: 'DRAFT',
    PENDING: 'DRAFT',
    SCHEDULED: 'ACTIVE',
    IN_PROGRESS: 'ACTIVE',
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'DRAFT',
    PAID: 'COMPLETED',
    INVOICED: 'COMPLETED',
  }

  return statusMap[externalStatus.toUpperCase()] || 'DRAFT'
}
