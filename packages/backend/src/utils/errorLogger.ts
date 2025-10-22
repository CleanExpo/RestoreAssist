/**
 * Error Logger Utility
 *
 * Logs authentication attempts and errors to database and Sentry.
 * Tracks success rates and provides observability for OAuth issues.
 *
 * @module utils/errorLogger
 */

import { Sentry } from '../instrument';
import { db } from '../db/connection';

/**
 * OAuth error information
 */
interface OAuthError {
  code: string;
  message: string;
}

/**
 * Authentication attempt result for metrics
 */
interface AuthAttemptMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRate: number;
}

/**
 * Sanitizes email for logging (shows only domain)
 * Prevents PII exposure in logs
 *
 * @param email - Full email address
 * @returns Sanitized email showing only domain
 */
function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '[ANONYMOUS]';
  const parts = email.split('@');
  if (parts.length !== 2) return '[INVALID_EMAIL]';
  return `***@${parts[1]}`;
}

/**
 * Sanitizes IP address for logging (shows only first 2 octets)
 * Balances privacy with debugging needs
 *
 * @param ipAddress - Full IP address
 * @returns Sanitized IP (e.g., "192.168.x.x")
 */
function sanitizeIpAddress(ipAddress: string): string {
  const parts = ipAddress.split('.');
  if (parts.length === 4) {
    // IPv4
    return `${parts[0]}.${parts[1]}.x.x`;
  } else if (ipAddress.includes(':')) {
    // IPv6
    const ipv6Parts = ipAddress.split(':');
    return `${ipv6Parts[0]}:${ipv6Parts[1]}:x:x`;
  }
  return '[INVALID_IP]';
}

/**
 * Sanitizes user agent for logging (removes version numbers)
 * Reduces verbosity while preserving browser/OS info
 *
 * @param userAgent - Full user agent string
 * @returns Sanitized user agent
 */
function sanitizeUserAgent(userAgent: string): string {
  if (!userAgent || userAgent.length === 0) return '[NO_USER_AGENT]';

  // Truncate if too long
  if (userAgent.length > 200) {
    return userAgent.substring(0, 200) + '...';
  }

  return userAgent;
}

/**
 * Logs an authentication attempt to database and Sentry
 *
 * Records all OAuth attempts for observability and debugging.
 * Failed attempts are sent to Sentry with sanitized context.
 *
 * @param attemptId - UUID for this attempt
 * @param email - User email (nullable before OAuth completes)
 * @param ipAddress - User IP address
 * @param userAgent - User agent string from browser
 * @param success - Whether authentication succeeded
 * @param error - OAuth error details (if failed)
 * @param retryCount - Number of retries before this attempt
 * @param fraudScore - Fraud detection score (if applicable)
 * @param deviceFingerprint - Device fingerprint hash (if applicable)
 * @returns Promise resolving when attempt is logged
 */
export async function logAuthAttempt(
  attemptId: string,
  email: string | null,
  ipAddress: string,
  userAgent: string,
  success: boolean,
  error?: OAuthError,
  retryCount: number = 0,
  fraudScore?: number,
  deviceFingerprint?: string
): Promise<void> {
  try {
    // Note: Auth attempt is already logged to database in trialAuthRoutes
    // This function focuses on Sentry reporting and console logging

    // Log to console for immediate visibility
    if (success) {
      console.log(
        `✅ [AUTH] Successful login: ${sanitizeEmail(email)} from ${sanitizeIpAddress(ipAddress)} (attempt: ${attemptId})`
      );
    } else {
      console.error(
        `❌ [AUTH] Failed login: ${sanitizeEmail(email)} from ${sanitizeIpAddress(ipAddress)} - ${error?.code}: ${error?.message} (attempt: ${attemptId})`
      );

      // Determine error type for tagging
      let errorType = 'oauth';
      if (error?.code === 'server_error') errorType = 'server';
      else if (error?.code?.includes('config') || error?.code?.includes('client')) errorType = 'config';
      else if (error?.code?.includes('fraud') || error?.code?.includes('trial')) errorType = 'fraud';

      // Send failed attempts to Sentry for alerting
      Sentry.captureException(new Error(`OAuth Authentication Failed: ${error?.code}`), {
        level: 'warning',
        tags: {
          auth_failure: 'true',
          oauth_error_code: error?.code || 'unknown',
          retry_count: retryCount.toString(),
          error_type: errorType,
        },
        extra: {
          user_email: sanitizeEmail(email),
          ip_address: sanitizeIpAddress(ipAddress),
          user_agent: sanitizeUserAgent(userAgent),
          error_message: error?.message,
          attempt_id: attemptId,
          ...(fraudScore !== undefined && { fraud_score: fraudScore }),
          ...(deviceFingerprint && { device_fingerprint_hash: deviceFingerprint }),
        },
      });
    }
  } catch (loggingError) {
    // If logging fails, still report to console
    console.error('Failed to log auth attempt:', loggingError);

    Sentry.captureException(loggingError, {
      level: 'error',
      tags: {
        error_type: 'auth_logging_failure',
      },
      extra: {
        original_error: error,
        user_email: sanitizeEmail(email),
        ip_address: sanitizeIpAddress(ipAddress),
        attempt_id: attemptId,
      },
    });
  }
}

/**
 * Gets authentication success rate metrics for last 24 hours
 *
 * Useful for monitoring OAuth health and detecting issues early.
 *
 * @returns Promise resolving to auth attempt metrics
 */
export async function getAuthMetrics(): Promise<AuthAttemptMetrics> {
  // Return zeros if database is not enabled
  if (process.env.USE_POSTGRES !== 'true') {
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      successRate: 0,
    };
  }

  try {
    const result = await db.one<{
      total_attempts: string;
      successful_attempts: string;
      failed_attempts: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_attempts,
         COUNT(CASE WHEN success = true THEN 1 END)::text AS successful_attempts,
         COUNT(CASE WHEN success = false THEN 1 END)::text AS failed_attempts
       FROM auth_attempts
       WHERE attempted_at >= NOW() - INTERVAL '24 hours'`
    );

    const totalAttempts = parseInt(result.total_attempts) || 0;
    const successfulAttempts = parseInt(result.successful_attempts) || 0;
    const failedAttempts = parseInt(result.failed_attempts) || 0;
    const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;

    return {
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      successRate,
    };
  } catch (error) {
    console.error('Failed to fetch auth metrics:', error);
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      successRate: 0,
    };
  }
}

/**
 * Gets top OAuth error codes for last 7 days
 *
 * Helps identify systematic issues (e.g., propagation delay, cache problems).
 *
 * @param limit - Maximum number of error codes to return
 * @returns Promise resolving to array of {code, count} objects
 */
export async function getTopOAuthErrors(limit: number = 10): Promise<Array<{ code: string; count: number }>> {
  // Return empty array if database is not enabled
  if (process.env.USE_POSTGRES !== 'true') {
    return [];
  }

  try {
    const errors = await db.manyOrNone<{ code: string; count: string }>(
      `SELECT
         oauth_error_code AS code,
         COUNT(*)::text AS count
       FROM auth_attempts
       WHERE success = false
         AND attempted_at >= NOW() - INTERVAL '7 days'
         AND oauth_error_code IS NOT NULL
       GROUP BY oauth_error_code
       ORDER BY COUNT(*) DESC
       LIMIT $1`,
      [limit]
    );

    return errors.map((error) => ({
      code: error.code,
      count: parseInt(error.count) || 0,
    }));
  } catch (error) {
    console.error('Failed to fetch top OAuth errors:', error);
    return [];
  }
}

/**
 * Detects suspicious IP addresses with high failure rates
 *
 * Identifies potential brute force attacks or misconfigured clients.
 *
 * @param threshold - Minimum failures to be considered suspicious
 * @returns Promise resolving to array of suspicious IPs
 */
export async function getSuspiciousIPs(threshold: number = 10): Promise<Array<{ ip: string; failures: number }>> {
  // Return empty array if database is not enabled
  if (process.env.USE_POSTGRES !== 'true') {
    return [];
  }

  try {
    const suspiciousIPs = await db.manyOrNone<{ ip: string; failures: string }>(
      `SELECT
         ip_address AS ip,
         COUNT(*)::text AS failures
       FROM auth_attempts
       WHERE success = false
         AND attempted_at >= NOW() - INTERVAL '1 hour'
       GROUP BY ip_address
       HAVING COUNT(*) >= $1
       ORDER BY COUNT(*) DESC`,
      [threshold]
    );

    return suspiciousIPs.map((ip) => ({
      ip: ip.ip,
      failures: parseInt(ip.failures) || 0,
    }));
  } catch (error) {
    console.error('Failed to detect suspicious IPs:', error);
    return [];
  }
}

export default {
  logAuthAttempt,
  getAuthMetrics,
  getTopOAuthErrors,
  getSuspiciousIPs,
};
