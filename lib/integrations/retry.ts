/**
 * Retry Utility with Exponential Backoff
 *
 * Automatically retries failed operations with increasing delay
 * Handles transient errors from external APIs
 */

export interface RetryOptions {
  maxRetries: number
  initialDelay: number // milliseconds
  maxDelay: number // milliseconds
  factor: number // multiplier for each retry
  onRetry?: (attempt: number, error: Error, delay: number) => void
}

export class RetryError extends Error {
  public attempts: number
  public lastError: Error

  constructor(message: string, attempts: number, lastError: Error) {
    super(message)
    this.name = 'RetryError'
    this.attempts = attempts
    this.lastError = lastError
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if error is retryable
 * Don't retry on 4xx errors (except 429 rate limit)
 */
function isRetryableError(error: any): boolean {
  // Network errors are retryable
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true
  }

  // Check HTTP status codes
  const status = error.status || error.statusCode || error.response?.status

  if (!status) {
    // Unknown error type, allow retry
    return true
  }

  // 429 (Rate Limit) is retryable
  if (status === 429) {
    return true
  }

  // 5xx (Server Errors) are retryable
  if (status >= 500 && status < 600) {
    return true
  }

  // 408 (Request Timeout) is retryable
  if (status === 408) {
    return true
  }

  // 4xx (Client Errors) are NOT retryable
  if (status >= 400 && status < 500) {
    return false
  }

  // Default: allow retry
  return true
}

/**
 * Calculate next delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  factor: number
): number {
  // Base delay: initialDelay * factor^attempt
  const baseDelay = initialDelay * Math.pow(factor, attempt)

  // Cap at maxDelay
  const cappedDelay = Math.min(baseDelay, maxDelay)

  // Add jitter (randomness) to prevent thundering herd
  // Jitter range: 80% to 100% of calculated delay
  const jitter = 0.8 + Math.random() * 0.2
  const finalDelay = Math.floor(cappedDelay * jitter)

  return finalDelay
}

/**
 * Retry a function with exponential backoff
 *
 * @example
 * const result = await retryWithExponentialBackoff(
 *   () => fetchDataFromAPI(),
 *   {
 *     maxRetries: 3,
 *     initialDelay: 1000,
 *     maxDelay: 10000,
 *     factor: 2
 *   }
 * )
 */
export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    initialDelay,
    maxDelay,
    factor,
    onRetry
  } = options

  let lastError: Error = new Error('Unknown error')
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      // Execute the function
      const result = await fn()
      return result
    } catch (error: any) {
      lastError = error
      attempt++

      // Check if we should retry
      if (attempt > maxRetries) {
        // Max retries exceeded
        throw new RetryError(
          `Operation failed after ${maxRetries} retries: ${error.message}`,
          attempt,
          error
        )
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Don't retry on non-retryable errors (e.g., 4xx)
        throw error
      }

      // Calculate delay for this retry
      const delay = calculateDelay(attempt - 1, initialDelay, maxDelay, factor)

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt, error, delay)
      }

      console.log(
        `[Retry] Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`
      )

      // Wait before retrying
      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new RetryError(
    `Operation failed after ${maxRetries} retries`,
    attempt,
    lastError
  )
}

/**
 * Default retry options for integration APIs
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  factor: 2 // Double delay each time
}

/**
 * Aggressive retry options for critical operations
 */
export const AGGRESSIVE_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  initialDelay: 500, // 500ms
  maxDelay: 30000, // 30 seconds
  factor: 2.5
}

/**
 * Conservative retry options for rate-limited APIs
 */
export const CONSERVATIVE_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 2000, // 2 seconds
  maxDelay: 60000, // 60 seconds
  factor: 3
}

/**
 * Wrap an async function with retry logic
 * Returns a new function that automatically retries on failure
 *
 * @example
 * const fetchWithRetry = withRetry(fetchDataFromAPI, DEFAULT_RETRY_OPTIONS)
 * const result = await fetchWithRetry()
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): T {
  return ((...args: any[]) => {
    return retryWithExponentialBackoff(() => fn(...args), options)
  }) as T
}

/**
 * Retry with custom predicate
 * Allows custom logic to determine if operation should be retried
 *
 * @example
 * await retryWithPredicate(
 *   () => fetchData(),
 *   (error) => error.code === 'RATE_LIMIT',
 *   DEFAULT_RETRY_OPTIONS
 * )
 */
export async function retryWithPredicate<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    initialDelay,
    maxDelay,
    factor,
    onRetry
  } = options

  let lastError: Error = new Error('Unknown error')
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      const result = await fn()
      return result
    } catch (error: any) {
      lastError = error
      attempt++

      // Check if we should retry
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error
      }

      // Calculate delay
      const delay = calculateDelay(attempt - 1, initialDelay, maxDelay, factor)

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt, error, delay)
      }

      console.log(
        `[Retry] Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`
      )

      // Wait before retrying
      await sleep(delay)
    }
  }

  throw new RetryError(
    `Operation failed after ${maxRetries} retries`,
    attempt,
    lastError
  )
}
