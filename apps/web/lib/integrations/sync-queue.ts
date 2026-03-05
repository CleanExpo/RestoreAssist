import { prisma } from '@/lib/prisma'
import { IntegrationProvider } from '@prisma/client'
import { withRateLimit } from './rate-limiter'
import { withCircuitBreaker, DEFAULT_CIRCUIT_OPTIONS } from './circuit-breaker'
import { retryWithExponentialBackoff, DEFAULT_RETRY_OPTIONS } from './retry'

/**
 * Sync Queue System
 *
 * Manages invoice sync operations with:
 * - Priority queuing (manual syncs > scheduled syncs)
 * - Rate limiting per provider
 * - Circuit breaker protection
 * - Retry logic with exponential backoff
 */

export interface SyncJob {
  id: string
  invoiceId: string
  provider: IntegrationProvider
  priority: 'HIGH' | 'NORMAL' | 'LOW'
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  retryCount: number
  errorMessage?: string
  createdAt: Date
}

// In-memory queue (would use Redis or database in production)
const syncQueue: SyncJob[] = []
let processingJobs: Set<string> = new Set()

/**
 * Add invoice to sync queue
 */
export function queueInvoiceSync(
  invoiceId: string,
  provider: IntegrationProvider,
  priority: 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL'
): string {
  // Check if already queued
  const existing = syncQueue.find(
    job => job.invoiceId === invoiceId && job.provider === provider && job.status === 'PENDING'
  )

  if (existing) {
    // Update priority if higher
    if (
      (priority === 'HIGH' && existing.priority !== 'HIGH') ||
      (priority === 'NORMAL' && existing.priority === 'LOW')
    ) {
      existing.priority = priority
      console.log(`[Sync Queue] Updated priority for invoice ${invoiceId} to ${priority}`)
    }
    return existing.id
  }

  // Create new job
  const job: SyncJob = {
    id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    invoiceId,
    provider,
    priority,
    status: 'PENDING',
    retryCount: 0,
    createdAt: new Date()
  }

  syncQueue.push(job)

  console.log(
    `[Sync Queue] Queued invoice ${invoiceId} for ${provider} sync (priority: ${priority})`
  )

  return job.id
}

/**
 * Get next job from queue (priority-based)
 */
function getNextJob(): SyncJob | null {
  // Sort by priority then creation time
  const priorityOrder = { HIGH: 0, NORMAL: 1, LOW: 2 }

  const sortedQueue = syncQueue
    .filter(job => job.status === 'PENDING' && !processingJobs.has(job.id))
    .sort((a, b) => {
      // First by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff

      // Then by creation time (older first)
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

  return sortedQueue[0] || null
}

/**
 * Process a single sync job
 */
async function processSyncJob(job: SyncJob): Promise<void> {
  try {
    console.log(`[Sync Queue] Processing job ${job.id}: invoice ${job.invoiceId} → ${job.provider}`)

    // Mark as processing
    job.status = 'PROCESSING'
    processingJobs.add(job.id)

    // Fetch invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: job.invoiceId },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    if (!invoice) {
      throw new Error(`Invoice ${job.invoiceId} not found`)
    }

    // Execute sync with rate limiting, circuit breaker, and retry
    const serviceName = `${job.provider}-sync`

    await withRateLimit(job.provider, async () => {
      await withCircuitBreaker(
        serviceName,
        async () => {
          await retryWithExponentialBackoff(
            async () => {
              // Actual sync logic would go here
              // For now, simulate sync
              await syncInvoiceToProvider(invoice, job.provider)
            },
            DEFAULT_RETRY_OPTIONS
          )
        },
        DEFAULT_CIRCUIT_OPTIONS
      )
    })

    // Mark as completed
    job.status = 'COMPLETED'
    job.errorMessage = undefined

    console.log(`[Sync Queue] Completed job ${job.id}`)

    // Create audit log
    await prisma.invoiceAuditLog.create({
      data: {
        invoiceId: invoice.id,
        userId: invoice.userId,
        action: 'sync_queued',
        description: `Invoice synced to ${job.provider} via queue`,
        metadata: {
          jobId: job.id,
          priority: job.priority
        }
      }
    })
  } catch (error: any) {
    console.error(`[Sync Queue] Job ${job.id} failed:`, error)

    job.retryCount++
    job.errorMessage = error.message

    // Retry or fail
    if (job.retryCount >= 3) {
      job.status = 'FAILED'
      console.error(`[Sync Queue] Job ${job.id} failed after ${job.retryCount} attempts`)
    } else {
      job.status = 'PENDING'
      console.log(`[Sync Queue] Job ${job.id} will be retried (attempt ${job.retryCount}/3)`)
    }
  } finally {
    processingJobs.delete(job.id)
  }
}

/**
 * Process sync queue
 */
export async function processSyncQueue(options: {
  maxConcurrent?: number
  maxJobs?: number
} = {}): Promise<{
  processed: number
  failed: number
  remaining: number
}> {
  const { maxConcurrent = 3, maxJobs = 20 } = options

  let processed = 0
  let failed = 0

  console.log(`[Sync Queue] Starting queue processing (max concurrent: ${maxConcurrent})`)

  // Process jobs in parallel up to maxConcurrent
  const activePromises: Promise<void>[] = []

  while (processed + failed < maxJobs) {
    // Wait if at max concurrency
    while (activePromises.length >= maxConcurrent) {
      await Promise.race(activePromises)
      // Remove completed promises
      activePromises.splice(
        0,
        activePromises.length,
        ...activePromises.filter(p => {
          let completed = false
          p.then(() => { completed = true }).catch(() => { completed = true })
          return !completed
        })
      )
    }

    // Get next job
    const job = getNextJob()

    if (!job) {
      // No more jobs
      break
    }

    // Start processing
    const promise = processSyncJob(job)
      .then(() => { processed++ })
      .catch(() => { failed++ })

    activePromises.push(promise)
  }

  // Wait for all remaining jobs
  await Promise.allSettled(activePromises)

  const remaining = syncQueue.filter(
    job => job.status === 'PENDING' || job.status === 'PROCESSING'
  ).length

  console.log(
    `[Sync Queue] Completed: ${processed} processed, ${failed} failed, ${remaining} remaining`
  )

  return { processed, failed, remaining }
}

/**
 * Get queue statistics
 */
export function getSyncQueueStats() {
  const stats = {
    total: syncQueue.length,
    pending: syncQueue.filter(j => j.status === 'PENDING').length,
    processing: syncQueue.filter(j => j.status === 'PROCESSING').length,
    completed: syncQueue.filter(j => j.status === 'COMPLETED').length,
    failed: syncQueue.filter(j => j.status === 'FAILED').length,
    byPriority: {
      high: syncQueue.filter(j => j.priority === 'HIGH' && j.status === 'PENDING').length,
      normal: syncQueue.filter(j => j.priority === 'NORMAL' && j.status === 'PENDING').length,
      low: syncQueue.filter(j => j.priority === 'LOW' && j.status === 'PENDING').length
    },
    byProvider: {} as Record<string, number>
  }

  // Count by provider
  syncQueue
    .filter(j => j.status === 'PENDING')
    .forEach(j => {
      stats.byProvider[j.provider] = (stats.byProvider[j.provider] || 0) + 1
    })

  return stats
}

/**
 * Clear completed and failed jobs (older than 1 hour)
 */
export function cleanupSyncQueue(): number {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const before = syncQueue.length

  // Remove old completed/failed jobs
  syncQueue.splice(
    0,
    syncQueue.length,
    ...syncQueue.filter(
      job =>
        !((job.status === 'COMPLETED' || job.status === 'FAILED') &&
          job.createdAt < oneHourAgo)
    )
  )

  const after = syncQueue.length
  const removed = before - after

  if (removed > 0) {
    console.log(`[Sync Queue] Cleaned up ${removed} old jobs`)
  }

  return removed
}

/**
 * Simulate invoice sync (placeholder for actual implementation)
 * In reality, this would call the integration client
 */
async function syncInvoiceToProvider(
  invoice: any,
  provider: IntegrationProvider
): Promise<void> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))

  // Simulate occasional failures for testing
  if (Math.random() < 0.05) {
    throw new Error(`Simulated sync failure for ${provider}`)
  }

  console.log(`[Sync Queue] Synced invoice ${invoice.id} to ${provider}`)
}

/**
 * Get job status
 */
export function getJobStatus(jobId: string): SyncJob | null {
  return syncQueue.find(job => job.id === jobId) || null
}

/**
 * Cancel pending job
 */
export function cancelJob(jobId: string): boolean {
  const job = syncQueue.find(j => j.id === jobId)

  if (!job || job.status !== 'PENDING') {
    return false
  }

  job.status = 'FAILED'
  job.errorMessage = 'Cancelled by user'

  console.log(`[Sync Queue] Cancelled job ${jobId}`)

  return true
}

/**
 * Retry failed job
 */
export function retryJob(jobId: string): boolean {
  const job = syncQueue.find(j => j.id === jobId)

  if (!job || job.status !== 'FAILED') {
    return false
  }

  job.status = 'PENDING'
  job.errorMessage = undefined
  job.retryCount = 0

  console.log(`[Sync Queue] Retrying job ${jobId}`)

  return true
}
