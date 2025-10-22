/**
 * Authentication Failure Tracker
 *
 * Tracks OAuth authentication failures in localStorage to detect patterns
 * that suggest browser cache issues.
 *
 * Features:
 * - Track failure count and timestamps
 * - Detect frequent failures (2+ within 5 minutes)
 * - Automatic cleanup of stale data
 * - Reset on successful authentication
 *
 * @module utils/authFailureTracker
 */

const STORAGE_KEY = 'restoreassist_auth_failures';
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_THRESHOLD = 2; // Show cache guidance after 2 failures

/**
 * Authentication failure tracking data
 */
export interface AuthFailureData {
  /** Number of failures within the current window */
  count: number;
  /** Timestamp of first failure in current window */
  firstFailureAt: number;
  /** Timestamp of most recent failure */
  lastFailureAt: number;
  /** List of error codes that triggered failures */
  errorCodes: string[];
}

/**
 * Get current failure tracking data from localStorage
 */
function getFailureData(): AuthFailureData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as AuthFailureData;

    // Check if data is stale (older than failure window)
    const now = Date.now();
    if (now - data.firstFailureAt > FAILURE_WINDOW_MS) {
      // Data is stale, clear it
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error reading auth failure data:', error);
    return null;
  }
}

/**
 * Save failure tracking data to localStorage
 */
function saveFailureData(data: AuthFailureData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving auth failure data:', error);
  }
}

/**
 * Record an authentication failure
 *
 * @param errorCode - OAuth error code that caused the failure
 */
export function recordAuthFailure(errorCode: string): void {
  const now = Date.now();
  const existing = getFailureData();

  if (!existing) {
    // First failure in this window
    saveFailureData({
      count: 1,
      firstFailureAt: now,
      lastFailureAt: now,
      errorCodes: [errorCode],
    });
    return;
  }

  // Increment failure count
  saveFailureData({
    count: existing.count + 1,
    firstFailureAt: existing.firstFailureAt,
    lastFailureAt: now,
    errorCodes: [...existing.errorCodes, errorCode],
  });
}

/**
 * Reset failure tracking (called on successful authentication)
 */
export function resetAuthFailures(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error resetting auth failure data:', error);
  }
}

/**
 * Check if cache guidance should be shown
 *
 * Returns true if user has experienced 2+ failures within 5 minutes
 *
 * @returns Whether to show cache clearing guidance
 */
export function shouldShowCacheGuidance(): boolean {
  const data = getFailureData();
  if (!data) return false;

  return data.count >= FAILURE_THRESHOLD;
}

/**
 * Get current failure count
 *
 * @returns Number of failures in current window, or 0 if none
 */
export function getFailureCount(): number {
  const data = getFailureData();
  return data?.count ?? 0;
}

/**
 * Get time until failure window resets
 *
 * @returns Milliseconds until window reset, or 0 if no active window
 */
export function getTimeUntilReset(): number {
  const data = getFailureData();
  if (!data) return 0;

  const now = Date.now();
  const windowEnd = data.firstFailureAt + FAILURE_WINDOW_MS;
  const remaining = windowEnd - now;

  return Math.max(0, remaining);
}

/**
 * Get failure statistics for debugging/logging
 *
 * @returns Failure statistics or null if no failures
 */
export function getFailureStats(): {
  count: number;
  windowStartedAt: Date;
  lastFailureAt: Date;
  errorCodes: string[];
  timeUntilReset: number;
} | null {
  const data = getFailureData();
  if (!data) return null;

  return {
    count: data.count,
    windowStartedAt: new Date(data.firstFailureAt),
    lastFailureAt: new Date(data.lastFailureAt),
    errorCodes: data.errorCodes,
    timeUntilReset: getTimeUntilReset(),
  };
}

/**
 * Check if a specific error code has occurred before
 *
 * @param errorCode - OAuth error code to check
 * @returns Whether this error has occurred in the current window
 */
export function hasErrorOccurredBefore(errorCode: string): boolean {
  const data = getFailureData();
  if (!data) return false;

  return data.errorCodes.includes(errorCode);
}

/**
 * Clear all failure tracking data (for testing/debugging)
 */
export function clearFailureData(): void {
  resetAuthFailures();
}

export default {
  recordAuthFailure,
  resetAuthFailures,
  shouldShowCacheGuidance,
  getFailureCount,
  getTimeUntilReset,
  getFailureStats,
  hasErrorOccurredBefore,
  clearFailureData,
};
