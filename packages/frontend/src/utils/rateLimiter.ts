/**
 * Frontend Rate Limiting Utility
 * Implements client-side rate limiting with exponential backoff
 * Protects against accidental API abuse and improves UX during failures
 */

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

interface RateLimitState {
  attempts: number;
  windowStart: number;
  backoffMs: number;
  blockedUntil: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitState> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor() {
    // Default configurations for different endpoint types
    this.configs.set('auth', {
      maxAttempts: 3,
      windowMs: 15 * 60 * 1000, // 15 minutes
      backoffMultiplier: 2,
      maxBackoffMs: 60 * 1000 // 1 minute max
    });

    this.configs.set('api', {
      maxAttempts: 50,
      windowMs: 60 * 1000, // 1 minute
      backoffMultiplier: 1.5,
      maxBackoffMs: 30 * 1000 // 30 seconds max
    });

    this.configs.set('report', {
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000, // 1 hour
      backoffMultiplier: 2,
      maxBackoffMs: 5 * 60 * 1000 // 5 minutes max
    });

    this.configs.set('stripe', {
      maxAttempts: 5,
      windowMs: 5 * 60 * 1000, // 5 minutes
      backoffMultiplier: 2,
      maxBackoffMs: 60 * 1000 // 1 minute max
    });

    // Clean up old entries periodically
    setInterval(() => this.cleanup(), 60 * 1000); // Every minute
  }

  /**
   * Check if a request should be allowed
   */
  public shouldAllow(key: string, type: 'auth' | 'api' | 'report' | 'stripe' = 'api'): boolean {
    const config = this.configs.get(type) || this.configs.get('api')!;
    const now = Date.now();

    let state = this.limits.get(key);

    // Initialize state if not exists
    if (!state) {
      state = {
        attempts: 0,
        windowStart: now,
        backoffMs: 0,
        blockedUntil: 0
      };
      this.limits.set(key, state);
    }

    // Check if currently blocked
    if (state.blockedUntil > now) {
      return false;
    }

    // Reset window if expired
    if (now - state.windowStart > config.windowMs) {
      state.attempts = 0;
      state.windowStart = now;
      state.backoffMs = 0;
      state.blockedUntil = 0;
    }

    // Check if limit exceeded
    if (state.attempts >= config.maxAttempts) {
      // Apply exponential backoff
      if (config.backoffMultiplier && config.backoffMultiplier > 1) {
        state.backoffMs = Math.min(
          (state.backoffMs || 1000) * config.backoffMultiplier,
          config.maxBackoffMs || 60000
        );
        state.blockedUntil = now + state.backoffMs;
      } else {
        // Block until window expires
        state.blockedUntil = state.windowStart + config.windowMs;
      }
      return false;
    }

    // Increment attempts
    state.attempts++;
    return true;
  }

  /**
   * Record a successful request (optionally reset backoff)
   */
  public recordSuccess(key: string, resetBackoff: boolean = true): void {
    const state = this.limits.get(key);
    if (state && resetBackoff) {
      state.backoffMs = 0;
    }
  }

  /**
   * Record a failed request
   */
  public recordFailure(key: string): void {
    const state = this.limits.get(key);
    if (state) {
      // Failure already recorded in shouldAllow
      // This is for additional failure tracking if needed
    }
  }

  /**
   * Get remaining time until unblocked (in ms)
   */
  public getBlockedTime(key: string): number {
    const state = this.limits.get(key);
    if (!state) return 0;

    const now = Date.now();
    return Math.max(0, state.blockedUntil - now);
  }

  /**
   * Get remaining attempts
   */
  public getRemainingAttempts(key: string, type: 'auth' | 'api' | 'report' | 'stripe' = 'api'): number {
    const config = this.configs.get(type) || this.configs.get('api')!;
    const state = this.limits.get(key);

    if (!state) return config.maxAttempts;

    const now = Date.now();
    if (now - state.windowStart > config.windowMs) {
      return config.maxAttempts;
    }

    return Math.max(0, config.maxAttempts - state.attempts);
  }

  /**
   * Reset rate limit for a key
   */
  public reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [key, state] of this.limits.entries()) {
      if (now - state.windowStart > maxAge && state.blockedUntil < now) {
        this.limits.delete(key);
      }
    }
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Rate-limited fetch wrapper
 */
export async function rateLimitedFetch(
  url: string,
  options: RequestInit = {},
  type: 'auth' | 'api' | 'report' | 'stripe' = 'api'
): Promise<Response> {
  const key = `${type}:${new URL(url, window.location.origin).pathname}`;

  // Check rate limit
  if (!rateLimiter.shouldAllow(key, type)) {
    const blockedTime = rateLimiter.getBlockedTime(key);
    const seconds = Math.ceil(blockedTime / 1000);
    throw new Error(`Rate limit exceeded. Please try again in ${seconds} seconds.`);
  }

  try {
    const response = await fetch(url, options);

    // Record success for successful responses
    if (response.ok) {
      rateLimiter.recordSuccess(key);
    } else if (response.status === 429) {
      // Server-side rate limit hit
      rateLimiter.recordFailure(key);
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Server rate limit exceeded. ${retryAfter ? `Try again in ${retryAfter}` : 'Please try again later.'}`);
    }

    return response;
  } catch (error) {
    // Record failure for network errors
    rateLimiter.recordFailure(key);
    throw error;
  }
}

/**
 * Hook for React components
 */
export function useRateLimiter() {
  return {
    shouldAllow: (key: string, type?: 'auth' | 'api' | 'report' | 'stripe') =>
      rateLimiter.shouldAllow(key, type),
    getRemainingAttempts: (key: string, type?: 'auth' | 'api' | 'report' | 'stripe') =>
      rateLimiter.getRemainingAttempts(key, type),
    getBlockedTime: (key: string) => rateLimiter.getBlockedTime(key),
    reset: (key: string) => rateLimiter.reset(key)
  };
}

export default rateLimiter;