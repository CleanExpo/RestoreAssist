import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/integrations/sync-errors - Get failed sync operations
 *
 * Returns all failed sync logs for the current user's integrations
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where clause
    const where: any = {
      integration: {
        userId: session.user.id
      },
      status: 'FAILED'
    }

    if (provider) {
      where.integration.provider = provider
    }

    // Get failed sync logs
    const errors = await prisma.integrationSyncLog.findMany({
      where,
      include: {
        integration: {
          select: {
            id: true,
            provider: true,
            name: true,
            status: true
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: limit,
      skip: offset
    })

    // Get total count
    const total = await prisma.integrationSyncLog.count({ where })

    // Get webhook errors as well
    const webhookErrors = await prisma.webhookEvent.findMany({
      where: {
        integration: {
          userId: session.user.id
        },
        status: 'FAILED',
        retryCount: {
          gte: 5 // Only show events that have maxed out retries
        }
      },
      include: {
        integration: {
          select: {
            id: true,
            provider: true,
            name: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    })

    return NextResponse.json({
      success: true,
      syncErrors: errors,
      webhookErrors,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    })
  } catch (error: any) {
    console.error('[Sync Errors] Error fetching sync errors:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch sync errors'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/integrations/sync-errors - Clear old error logs
 *
 * Removes sync error logs older than specified days
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    // Delete old sync errors
    const result = await prisma.integrationSyncLog.deleteMany({
      where: {
        integration: {
          userId: session.user.id
        },
        status: 'FAILED',
        startedAt: {
          lt: cutoffDate
        }
      }
    })

    return NextResponse.json({
      success: true,
      deleted: result.count
    })
  } catch (error: any) {
    console.error('[Sync Errors] Error deleting sync errors:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete sync errors'
      },
      { status: 500 }
    )
  }
}
