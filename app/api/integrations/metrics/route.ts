import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getQueueStats } from '@/lib/jobs/webhook-queue'
import { getSyncQueueStats } from '@/lib/integrations/sync-queue'
import { circuitBreakerManager } from '@/lib/integrations/circuit-breaker'
import { rateLimiterManager } from '@/lib/integrations/rate-limiter'

/**
 * GET /api/integrations/metrics - Get integration metrics and health statistics
 *
 * Returns comprehensive metrics for monitoring integration performance
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

    const { searchParams } = new URL(request.url)
    const timeWindow = parseInt(searchParams.get('window') || '24') // hours

    const windowStart = new Date()
    windowStart.setHours(windowStart.getHours() - timeWindow)

    // Get user's integrations
    const integrations = await prisma.integration.findMany({
      where: {
        userId: session.user.id
      },
      select: {
        id: true,
        provider: true,
        status: true,
        lastSyncAt: true
      }
    })

    // Sync metrics (last N hours)
    const syncLogs = await prisma.integrationSyncLog.findMany({
      where: {
        integration: {
          userId: session.user.id
        },
        startedAt: {
          gte: windowStart
        }
      },
      select: {
        id: true,
        syncType: true,
        status: true,
        recordsProcessed: true,
        recordsFailed: true,
        startedAt: true,
        completedAt: true,
        integration: {
          select: {
            provider: true
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      }
    })

    // Calculate sync stats
    const totalSyncs = syncLogs.length
    const successfulSyncs = syncLogs.filter(log => log.status === 'SUCCESS').length
    const failedSyncs = syncLogs.filter(log => log.status === 'FAILED').length
    const successRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 0

    // Average sync duration
    const completedSyncs = syncLogs.filter(log => log.completedAt)
    const avgDuration = completedSyncs.length > 0
      ? completedSyncs.reduce((sum, log) => {
          const duration = log.completedAt!.getTime() - log.startedAt.getTime()
          return sum + duration
        }, 0) / completedSyncs.length
      : 0

    // Stats by provider
    const byProvider: Record<string, any> = {}

    integrations.forEach(integration => {
      const providerLogs = syncLogs.filter(
        log => log.integration.provider === integration.provider
      )

      byProvider[integration.provider] = {
        status: integration.status,
        lastSyncAt: integration.lastSyncAt,
        totalSyncs: providerLogs.length,
        successfulSyncs: providerLogs.filter(log => log.status === 'SUCCESS').length,
        failedSyncs: providerLogs.filter(log => log.status === 'FAILED').length,
        successRate: providerLogs.length > 0
          ? (providerLogs.filter(log => log.status === 'SUCCESS').length / providerLogs.length) * 100
          : 0
      }
    })

    // Webhook metrics
    const webhookStats = await getQueueStats()

    // Sync queue metrics
    const syncQueueStats = getSyncQueueStats()

    // Circuit breaker stats
    const circuitBreakerStats = circuitBreakerManager.getAllStats()

    // Rate limiter stats
    const rateLimiterStats = rateLimiterManager.getAllStats()

    // Recent payments from webhooks
    const recentPayments = await prisma.invoicePayment.count({
      where: {
        userId: session.user.id,
        externalProvider: {
          not: null
        },
        createdAt: {
          gte: windowStart
        }
      }
    })

    // Active webhooks (last 24 hours)
    const activeWebhooks = await prisma.webhookEvent.count({
      where: {
        integration: {
          userId: session.user.id
        },
        createdAt: {
          gte: windowStart
        }
      }
    })

    return NextResponse.json({
      success: true,
      timeWindow,
      integrations: {
        total: integrations.length,
        connected: integrations.filter(i => i.status === 'CONNECTED').length,
        disconnected: integrations.filter(i => i.status === 'DISCONNECTED').length,
        error: integrations.filter(i => i.status === 'ERROR').length,
        byProvider
      },
      syncs: {
        total: totalSyncs,
        successful: successfulSyncs,
        failed: failedSyncs,
        successRate: Math.round(successRate * 100) / 100,
        avgDurationMs: Math.round(avgDuration)
      },
      webhooks: {
        ...webhookStats,
        activeInWindow: activeWebhooks
      },
      syncQueue: syncQueueStats,
      circuitBreakers: circuitBreakerStats,
      rateLimiters: rateLimiterStats,
      payments: {
        recentFromExternal: recentPayments
      },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[Metrics] Error fetching metrics:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch metrics'
      },
      { status: 500 }
    )
  }
}
