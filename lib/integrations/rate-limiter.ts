/**
 * Rate Limiter
 *
 * Implements token bucket algorithm to prevent exceeding API rate limits
 * Protects against rate limit errors from external services
 */

export interface RateLimiterOptions {
  tokensPerMinute: number // Maximum tokens per minute
  maxBurst: number // Maximum burst capacity
}

export class RateLimitError extends Error {
  public retryAfter: number // milliseconds until next token available

  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/**
 * Token Bucket Rate Limiter
 */
export class RateLimiter {
  private tokens: number
  private lastRefillTime: number

  constructor(private options: RateLimiterOptions) {
    // Start with full bucket
    this.tokens = options.maxBurst
    this.lastRefillTime = Date.now()
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsedMs = now - this.lastRefillTime

    // Calculate tokens to add based on time elapsed
    const tokensToAdd = (elapsedMs / 60000) * this.options.tokensPerMinute

    // Add tokens up to max burst capacity
    this.tokens = Math.min(
      this.options.maxBurst,
      this.tokens + tokensToAdd
    )

    this.lastRefillTime = now
  }

  /**
   * Try to acquire a token
   * Returns true if successful, false if rate limited
   */
  tryAcquire(count: number = 1): boolean {
    this.refill()

    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }

    return false
  }

  /**
   * Acquire token(s), waiting if necessary
   * Returns immediately if tokens available
   * Throws RateLimitError if wait would be too long
   */
  async acquire(count: number = 1, options?: { maxWaitMs?: number }): Promise<void> {
    const { maxWaitMs = 60000 } = options || {}

    this.refill()

    // If tokens available, acquire immediately
    if (this.tokens >= count) {
      this.tokens -= count
      return
    }

    // Calculate wait time
    const tokensNeeded = count - this.tokens
    const waitMs = (tokensNeeded / this.options.tokensPerMinute) * 60000

    if (waitMs > maxWaitMs) {
      throw new RateLimitError(
        `Rate limit exceeded. Need to wait ${Math.ceil(waitMs)}ms`,
        waitMs
      )
    }

    // Wait for tokens to refill
    console.log(`[Rate Limiter] Waiting ${Math.ceil(waitMs)}ms for ${count} tokens`)
    await sleep(waitMs)

    // Refill and acquire
    this.refill()
    this.tokens -= count
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill()
    return Math.floor(this.tokens)
  }

  /**
   * Get rate limiter stats
   */
  getStats() {
    return {
      availableTokens: this.getAvailableTokens(),
      maxBurst: this.options.maxBurst,
      tokensPerMinute: this.options.tokensPerMinute,
      lastRefillTime: this.lastRefillTime
    }
  }

  /**
   * Reset rate limiter (for testing)
   */
  reset(): void {
    this.tokens = this.options.maxBurst
    this.lastRefillTime = Date.now()
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Rate Limiter Manager
 * Manages multiple rate limiters (one per provider)
 */
class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map()

  /**
   * Get or create rate limiter for a provider
   */
  getLimiter(
    provider: string,
    options: RateLimiterOptions
  ): RateLimiter {
    const key = `${provider}:${options.tokensPerMinute}:${options.maxBurst}`

    if (!this.limiters.has(key)) {
      this.limiters.set(key, new RateLimiter(options))
    }

    return this.limiters.get(key)!
  }

  /**
   * Get all limiter stats
   */
  getAllStats() {
    const stats: any[] = []

    this.limiters.forEach((limiter, key) => {
      stats.push({
        key,
        ...limiter.getStats()
      })
    })

    return stats
  }

  /**
   * Reset all rate limiters
   */
  resetAll(): void {
    this.limiters.forEach(limiter => {
      limiter.reset()
    })
  }
}

// Global rate limiter manager
export const rateLimiterManager = new RateLimiterManager()

/**
 * Provider-specific rate limits
 * Based on official documentation
 */
export const PROVIDER_RATE_LIMITS: Record<string, RateLimiterOptions> = {
  XERO: {
    tokensPerMinute: 60, // 60 requests per minute
    maxBurst: 100 // Allow burst up to 100
  },
  QUICKBOOKS: {
    tokensPerMinute: 100, // 100 requests per minute (500 per 5 minutes)
    maxBurst: 500 // Allow burst up to 500
  },
  MYOB: {
    tokensPerMinute: 100, // 100 requests per minute (1000 per 10 minutes)
    maxBurst: 1000 // Allow burst up to 1000
  },
  SERVICEM8: {
    tokensPerMinute: 60,
    maxBurst: 100
  },
  ASCORA: {
    tokensPerMinute: 60,
    maxBurst: 100
  }
}

/**
 * Execute function with rate limiting
 *
 * @example
 * const result = await withRateLimit(
 *   'XERO',
 *   () => fetchFromXero()
 * )
 */
export async function withRateLimit<T>(
  provider: string,
  fn: () => Promise<T>,
  options?: { maxWaitMs?: number }
): Promise<T> {
  const rateLimit = PROVIDER_RATE_LIMITS[provider]

  if (!rateLimit) {
    console.warn(`[Rate Limiter] No rate limit defined for provider ${provider}`)
    return fn()
  }

  const limiter = rateLimiterManager.getLimiter(provider, rateLimit)

  // Acquire token before executing
  await limiter.acquire(1, options)

  // Execute function
  return fn()
}

/**
 * Batch executor with rate limiting
 * Executes multiple operations while respecting rate limits
 *
 * @example
 * const results = await executeBatchWithRateLimit(
 *   'XERO',
 *   invoices,
 *   (invoice) => syncInvoiceToXero(invoice)
 * )
 */
export async function executeBatchWithRateLimit<T, R>(
  provider: string,
  items: T[],
  fn: (item: T) => Promise<R>,
  options?: {
    concurrency?: number
    maxWaitMs?: number
  }
): Promise<R[]> {
  const { concurrency = 5, maxWaitMs } = options || {}

  const results: R[] = []
  const errors: Error[] = []

  // Process items in chunks to respect concurrency
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)

    const chunkResults = await Promise.allSettled(
      chunk.map(item =>
        withRateLimit(provider, () => fn(item), { maxWaitMs })
      )
    )

    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        console.error(
          `[Rate Limiter] Batch item ${i + index} failed:`,
          result.reason
        )
        errors.push(result.reason)
      }
    })
  }

  if (errors.length > 0) {
    console.warn(
      `[Rate Limiter] Batch completed with ${errors.length} errors`
    )
  }

  return results
}
