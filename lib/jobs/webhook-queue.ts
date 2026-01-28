import { processPendingWebhookEvents, processWebhookEvent } from '@/lib/integrations/webhook-processor'
import { prisma } from '@/lib/prisma'

/**
 * Webhook Queue System
 *
 * Manages background processing of webhook events
 * Uses database polling pattern (no Redis required)
 */

interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  total: number
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  const [pending, processing, completed, failed, total] = await Promise.all([
    prisma.webhookEvent.count({ where: { status: 'PENDING' } }),
    prisma.webhookEvent.count({ where: { status: 'PROCESSING' } }),
    prisma.webhookEvent.count({ where: { status: 'COMPLETED' } }),
    prisma.webhookEvent.count({ where: { status: 'FAILED' } }),
    prisma.webhookEvent.count()
  ])

  return {
    pending,
    processing,
    completed,
    failed,
    total
  }
}

/**
 * Process webhook queue
 * Polls for pending events and processes them
 */
export async function processWebhookQueue(options: {
  batchSize?: number
  maxConcurrent?: number
} = {}): Promise<{
  processed: number
  failed: number
  errors: string[]
}> {
  const {
    batchSize = 10,
    maxConcurrent = 3
  } = options

  console.log(`[Webhook Queue] Starting processing (batch: ${batchSize}, concurrent: ${maxConcurrent})`)

  // Get pending events
  const pendingEvents = await prisma.webhookEvent.findMany({
    where: {
      status: 'PENDING',
      retryCount: {
        lt: 5 // Max 5 retries
      }
    },
    orderBy: {
      createdAt: 'asc'
    },
    take: batchSize
  })

  if (pendingEvents.length === 0) {
    console.log('[Webhook Queue] No pending events to process')
    return { processed: 0, failed: 0, errors: [] }
  }

  console.log(`[Webhook Queue] Found ${pendingEvents.length} pending events`)

  let processed = 0
  let failed = 0
  const errors: string[] = []

  // Process events in chunks to respect maxConcurrent limit
  for (let i = 0; i < pendingEvents.length; i += maxConcurrent) {
    const chunk = pendingEvents.slice(i, i + maxConcurrent)

    const results = await Promise.allSettled(
      chunk.map(event => processWebhookEvent(event.id))
    )

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        processed++
      } else {
        failed++
        const error = `Event ${chunk[index].id}: ${result.reason}`
        errors.push(error)
        console.error(`[Webhook Queue] ${error}`)
      }
    })
  }

  console.log(`[Webhook Queue] Completed: ${processed} processed, ${failed} failed`)

  return { processed, failed, errors }
}

/**
 * Retry failed webhook events
 * Resets status to PENDING for manual retry
 */
export async function retryFailedEvents(options: {
  eventIds?: string[]
  olderThan?: Date
  limit?: number
} = {}): Promise<number> {
  const {
    eventIds,
    olderThan,
    limit = 100
  } = options

  const where: any = {
    status: 'FAILED'
  }

  if (eventIds && eventIds.length > 0) {
    where.id = { in: eventIds }
  }

  if (olderThan) {
    where.createdAt = { lt: olderThan }
  }

  // Reset status to PENDING and increment retry count
  const result = await prisma.webhookEvent.updateMany({
    where,
    data: {
      status: 'PENDING',
      errorMessage: null
    },
    take: limit
  })

  console.log(`[Webhook Queue] Reset ${result.count} failed events to PENDING`)

  return result.count
}

/**
 * Clean up old webhook events
 * Removes events older than specified days
 */
export async function cleanupOldEvents(options: {
  olderThanDays?: number
  keepFailed?: boolean
} = {}): Promise<number> {
  const {
    olderThanDays = 30,
    keepFailed = true
  } = options

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  const where: any = {
    createdAt: { lt: cutoffDate },
    status: { in: ['COMPLETED', 'SKIPPED'] }
  }

  if (!keepFailed) {
    where.status.in.push('FAILED')
  }

  const result = await prisma.webhookEvent.deleteMany({
    where
  })

  console.log(`[Webhook Queue] Deleted ${result.count} old events`)

  return result.count
}

/**
 * Get events by status
 */
export async function getEventsByStatus(
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED',
  options: {
    limit?: number
    offset?: number
  } = {}
): Promise<any[]> {
  const { limit = 50, offset = 0 } = options

  const events = await prisma.webhookEvent.findMany({
    where: { status },
    include: {
      integration: {
        select: {
          id: true,
          provider: true,
          name: true,
          userId: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset
  })

  return events
}

/**
 * Get event details by ID
 */
export async function getEventDetails(eventId: string): Promise<any> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
    include: {
      integration: {
        select: {
          id: true,
          provider: true,
          name: true,
          userId: true,
          status: true
        }
      }
    }
  })

  return event
}

/**
 * Background worker loop
 * Continuously processes webhook queue
 * NOT RECOMMENDED: Use external cron job instead
 */
let workerRunning = false
let workerIntervalId: NodeJS.Timeout | null = null

export function startWorker(intervalMs: number = 30000): void {
  if (workerRunning) {
    console.warn('[Webhook Queue] Worker already running')
    return
  }

  console.log(`[Webhook Queue] Starting background worker (interval: ${intervalMs}ms)`)

  workerRunning = true

  workerIntervalId = setInterval(async () => {
    try {
      await processWebhookQueue({ batchSize: 10, maxConcurrent: 3 })
    } catch (error) {
      console.error('[Webhook Queue] Worker error:', error)
    }
  }, intervalMs)
}

export function stopWorker(): void {
  if (!workerRunning) {
    console.warn('[Webhook Queue] Worker not running')
    return
  }

  console.log('[Webhook Queue] Stopping background worker')

  if (workerIntervalId) {
    clearInterval(workerIntervalId)
    workerIntervalId = null
  }

  workerRunning = false
}
