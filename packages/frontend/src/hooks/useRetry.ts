/**
 * useRetry Custom Hook
 *
 * Implements automatic retry logic with exponential backoff for transient errors.
 *
 * Features:
 * - Exponential backoff delays: 2s, 4s, 8s
 * - Maximum 3 retry attempts
 * - Countdown timer for next retry
 * - Respects error.retryable flag (stops if false)
 * - Manual retry trigger
 * - Reset functionality
 *
 * @module hooks/useRetry
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Delay multiplier in milliseconds for exponential backoff (default: [2000, 4000, 8000]) */
  delays?: number[];
  /** Whether to automatically retry (default: true) */
  autoRetry?: boolean;
}

/**
 * Retry state returned by the hook
 */
export interface RetryState {
  /** Current retry attempt number (0 = initial attempt, 1-3 = retry attempts) */
  retryCount: number;
  /** Whether a retry is currently in progress (waiting for delay) */
  isRetrying: boolean;
  /** Seconds remaining until next retry attempt */
  nextRetryIn: number;
  /** Whether max retry attempts have been exhausted */
  retriesExhausted: boolean;
  /** Manually trigger a retry (bypasses auto-retry) */
  retry: () => void;
  /** Reset retry state to initial values */
  reset: () => void;
}

/**
 * Default exponential backoff delays (in milliseconds)
 */
const DEFAULT_DELAYS = [2000, 4000, 8000]; // 2s, 4s, 8s

/**
 * useRetry Hook
 *
 * Manages retry logic with exponential backoff for error handling
 *
 * @param onRetry - Callback function to execute on retry
 * @param isRetryable - Whether the current error can be retried
 * @param config - Optional retry configuration
 * @returns Retry state and control functions
 *
 * @example
 * const { retry, isRetrying, retryCount, nextRetryIn } = useRetry(
 *   () => authenticateUser(),
 *   error?.retryable ?? false,
 *   { maxAttempts: 3, delays: [2000, 4000, 8000] }
 * );
 */
export function useRetry(
  onRetry: () => void | Promise<void>,
  isRetryable: boolean = true,
  config: RetryConfig = {}
): RetryState {
  const {
    maxAttempts = 3,
    delays = DEFAULT_DELAYS,
    autoRetry = true,
  } = config;

  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState(0);

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Clear all timers
   */
  const clearTimers = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  /**
   * Reset retry state to initial values
   */
  const reset = useCallback(() => {
    clearTimers();
    setRetryCount(0);
    setIsRetrying(false);
    setNextRetryIn(0);
  }, [clearTimers]);

  /**
   * Execute retry with delay
   */
  const executeRetry = useCallback(
    async (attemptNumber: number) => {
      // Check if retries exhausted
      if (attemptNumber >= maxAttempts) {
        setIsRetrying(false);
        setNextRetryIn(0);
        return;
      }

      // Check if still retryable
      if (!isRetryable) {
        setIsRetrying(false);
        setNextRetryIn(0);
        return;
      }

      // Get delay for this attempt (use last delay if beyond array length)
      const delayIndex = Math.min(attemptNumber, delays.length - 1);
      const delay = delays[delayIndex];

      setIsRetrying(true);
      setNextRetryIn(Math.ceil(delay / 1000)); // Convert to seconds

      // Start countdown timer (updates every second)
      countdownIntervalRef.current = setInterval(() => {
        setNextRetryIn((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            return 0;
          }
          return next;
        });
      }, 1000);

      // Schedule retry after delay
      retryTimeoutRef.current = setTimeout(async () => {
        clearTimers();
        setIsRetrying(false);
        setRetryCount(attemptNumber + 1);

        // Execute retry callback
        try {
          await onRetry();
        } catch (error) {
          console.error('Retry attempt failed:', error);
          // Error will be handled by parent component
        }
      }, delay);
    },
    [maxAttempts, isRetryable, delays, onRetry, clearTimers]
  );

  /**
   * Manual retry trigger
   */
  const retry = useCallback(() => {
    // Cancel any pending retry
    clearTimers();

    // Execute retry immediately (no delay for manual retry)
    setRetryCount((prev) => prev + 1);
    setIsRetrying(false);
    setNextRetryIn(0);

    onRetry();
  }, [onRetry, clearTimers]);

  /**
   * Auto-retry effect
   * Triggers when error changes and auto-retry is enabled
   */
  useEffect(() => {
    if (!autoRetry || !isRetryable || retryCount >= maxAttempts) {
      return;
    }

    // Only auto-retry after the first attempt (retryCount > 0)
    if (retryCount > 0) {
      executeRetry(retryCount);
    }

    return () => {
      clearTimers();
    };
  }, [autoRetry, isRetryable, retryCount, maxAttempts, executeRetry, clearTimers]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const retriesExhausted = retryCount >= maxAttempts;

  return {
    retryCount,
    isRetrying,
    nextRetryIn,
    retriesExhausted,
    retry,
    reset,
  };
}

/**
 * Calculate total time spent retrying
 *
 * @param delays - Array of delay values
 * @param attempts - Number of attempts made
 * @returns Total time in milliseconds
 */
export function calculateTotalRetryTime(delays: number[], attempts: number): number {
  return delays.slice(0, Math.min(attempts, delays.length)).reduce((sum, delay) => sum + delay, 0);
}

/**
 * Get delay for specific retry attempt
 *
 * @param attemptNumber - Retry attempt number (0-indexed)
 * @param delays - Array of delay values
 * @returns Delay in milliseconds
 */
export function getRetryDelay(attemptNumber: number, delays: number[] = DEFAULT_DELAYS): number {
  const index = Math.min(attemptNumber, delays.length - 1);
  return delays[index];
}

export default useRetry;
