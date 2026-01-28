/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by stopping requests to failing services
 * Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Service is down, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number // Number of failures before opening circuit
  successThreshold: number // Number of successes to close circuit from half-open
  timeout: number // Time in ms before attempting recovery (half-open)
  windowSize: number // Time window in ms for counting failures
}

export class CircuitBreakerError extends Error {
  public state: CircuitState

  constructor(message: string, state: CircuitState) {
    super(message)
    this.name = 'CircuitBreakerError'
    this.state = state
  }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number | null = null
  private openTime: number | null = null
  private recentRequests: { timestamp: number; success: boolean }[] = []

  constructor(
    private name: string,
    private options: CircuitBreakerOptions
  ) {}

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      openTime: this.openTime,
      recentRequests: this.recentRequests.length
    }
  }

  /**
   * Clean up old requests from window
   */
  private cleanupWindow(): void {
    const now = Date.now()
    const cutoff = now - this.options.windowSize

    this.recentRequests = this.recentRequests.filter(
      req => req.timestamp > cutoff
    )
  }

  /**
   * Calculate failure rate in current window
   */
  private getFailureRate(): number {
    this.cleanupWindow()

    if (this.recentRequests.length === 0) {
      return 0
    }

    const failures = this.recentRequests.filter(req => !req.success).length
    return failures / this.recentRequests.length
  }

  /**
   * Check if circuit should transition to HALF_OPEN
   */
  private shouldAttemptReset(): boolean {
    if (this.state !== CircuitState.OPEN) {
      return false
    }

    if (!this.openTime) {
      return false
    }

    const now = Date.now()
    const timeSinceOpen = now - this.openTime

    return timeSinceOpen >= this.options.timeout
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should attempt reset
    if (this.shouldAttemptReset()) {
      console.log(`[Circuit Breaker] ${this.name}: Attempting reset (HALF_OPEN)`)
      this.state = CircuitState.HALF_OPEN
      this.successCount = 0
      this.failureCount = 0
    }

    // If circuit is open, reject immediately
    if (this.state === CircuitState.OPEN) {
      throw new CircuitBreakerError(
        `Circuit breaker is OPEN for ${this.name}`,
        CircuitState.OPEN
      )
    }

    const startTime = Date.now()

    try {
      // Execute the function
      const result = await fn()

      // Record success
      this.onSuccess()

      return result
    } catch (error) {
      // Record failure
      this.onFailure()

      throw error
    } finally {
      // Track request
      const success = true // Will be false if error was thrown
      this.recentRequests.push({
        timestamp: Date.now(),
        success: this.state !== CircuitState.OPEN
      })
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0
    this.lastFailureTime = null

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++

      console.log(
        `[Circuit Breaker] ${this.name}: Success in HALF_OPEN (${this.successCount}/${this.options.successThreshold})`
      )

      // Close circuit after enough successes
      if (this.successCount >= this.options.successThreshold) {
        console.log(`[Circuit Breaker] ${this.name}: Circuit CLOSED`)
        this.state = CircuitState.CLOSED
        this.successCount = 0
        this.openTime = null
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    // If in HALF_OPEN, immediately open circuit on failure
    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[Circuit Breaker] ${this.name}: Failure in HALF_OPEN, reopening circuit`)
      this.state = CircuitState.OPEN
      this.openTime = Date.now()
      this.successCount = 0
      return
    }

    // Check if we should open circuit
    const failureRate = this.getFailureRate()

    if (
      this.state === CircuitState.CLOSED &&
      (this.failureCount >= this.options.failureThreshold || failureRate >= 0.5)
    ) {
      console.log(
        `[Circuit Breaker] ${this.name}: Opening circuit (failures: ${this.failureCount}, rate: ${failureRate.toFixed(2)})`
      )
      this.state = CircuitState.OPEN
      this.openTime = Date.now()
    }
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    console.log(`[Circuit Breaker] ${this.name}: Manual reset`)
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.openTime = null
    this.recentRequests = []
  }

  /**
   * Manually trip circuit breaker (for testing)
   */
  trip(): void {
    console.log(`[Circuit Breaker] ${this.name}: Manual trip`)
    this.state = CircuitState.OPEN
    this.openTime = Date.now()
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers (one per service)
 */
class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map()

  /**
   * Get or create circuit breaker for a service
   */
  getBreaker(
    name: string,
    options: CircuitBreakerOptions
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options))
    }

    return this.breakers.get(name)!
  }

  /**
   * Get all breaker stats
   */
  getAllStats() {
    const stats: any[] = []

    this.breakers.forEach(breaker => {
      stats.push(breaker.getStats())
    })

    return stats
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => {
      breaker.reset()
    })
  }
}

// Global circuit breaker manager
export const circuitBreakerManager = new CircuitBreakerManager()

/**
 * Default circuit breaker options
 */
export const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5, // Open after 5 failures
  successThreshold: 2, // Close after 2 successes in half-open
  timeout: 60000, // Try recovery after 60 seconds
  windowSize: 300000 // 5 minute rolling window
}

/**
 * Conservative circuit breaker options (for critical services)
 */
export const CONSERVATIVE_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 3,
  successThreshold: 3,
  timeout: 120000, // 2 minutes
  windowSize: 600000 // 10 minutes
}

/**
 * Aggressive circuit breaker options (for less critical services)
 */
export const AGGRESSIVE_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 10,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  windowSize: 180000 // 3 minutes
}

/**
 * Execute function with circuit breaker protection
 *
 * @example
 * const result = await withCircuitBreaker(
 *   'xero-api',
 *   () => fetchFromXero(),
 *   DEFAULT_CIRCUIT_OPTIONS
 * )
 */
export async function withCircuitBreaker<T>(
  serviceName: string,
  fn: () => Promise<T>,
  options: CircuitBreakerOptions = DEFAULT_CIRCUIT_OPTIONS
): Promise<T> {
  const breaker = circuitBreakerManager.getBreaker(serviceName, options)
  return breaker.execute(fn)
}
