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
 * @param email - User email (nullable before OAuth completes)
 * @param ipAddress - User IP address
 * @param userAgent - User agent string from browser
 * @param success - Whether authentication succeeded
 * @param error - OAuth error details (if failed)
 * @param retryCount - Number of retries before this attempt
 * @returns Promise resolving when attempt is logged
 */
export async function logAuthAttempt(
  email: string | null,
  ipAddress: string,
  userAgent: string,
  success: boolean,
  error?: OAuthError,
  retryCount: number = 0
): Promise<void> {
  try {
    // Save to database for analytics
    const attempt = await db.authAttempt.create({
      data: {
        userEmail: email,
        ipAddress,
        userAgent,
        success,
        oauthErrorCode: error?.code,
        oauthErrorMessage: error?.message,
        retryCount,
        attemptedAt: new Date(),
      },
    });

    // Log to console for immediate visibility
    if (success) {
      console.log(
        `✅ [AUTH] Successful login: ${sanitizeEmail(email)} from ${sanitizeIpAddress(ipAddress)}`
      );
    } else {
      console.error(
        `❌ [AUTH] Failed login: ${sanitizeEmail(email)} from ${sanitizeIpAddress(ipAddress)} - ${error?.code}: ${error?.message}`
      );

      // Send failed attempts to Sentry for alerting
      Sentry.captureException(new Error(`OAuth Authentication Failed: ${error?.code}`), {
        level: 'warning',
        tags: {
          oauth_error_code: error?.code,
          retry_count: retryCount,
        },
        extra: {
          user_email: sanitizeEmail(email),
          ip_address: sanitizeIpAddress(ipAddress),
          user_agent: sanitizeUserAgent(userAgent),
          error_message: error?.message,
          attempt_id: attempt.attemptId,
        },
      });
    }
  } catch (dbError) {
    // If database logging fails, still log to console and Sentry
    console.error('Failed to log auth attempt to database:', dbError);

    Sentry.captureException(dbError, {
      level: 'error',
      tags: {
        error_type: 'database_logging_failure',
      },
      extra: {
        original_error: error,
        user_email: sanitizeEmail(email),
        ip_address: sanitizeIpAddress(ipAddress),
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
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const attempts = await db.authAttempt.findMany({
      where: {
        attemptedAt: {
          gte: twentyFourHoursAgo,
        },
      },
      select: {
        success: true,
      },
    });

    const totalAttempts = attempts.length;
    const successfulAttempts = attempts.filter((a) => a.success).length;
    const failedAttempts = totalAttempts - successfulAttempts;
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
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const errors = await db.authAttempt.groupBy({
      by: ['oauthErrorCode'],
      where: {
        success: false,
        attemptedAt: {
          gte: sevenDaysAgo,
        },
        oauthErrorCode: {
          not: null,
        },
      },
      _count: {
        oauthErrorCode: true,
      },
      orderBy: {
        _count: {
          oauthErrorCode: 'desc',
        },
      },
      take: limit,
    });

    return errors.map((error) => ({
      code: error.oauthErrorCode!,
      count: error._count.oauthErrorCode,
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
  try {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const suspiciousIPs = await db.authAttempt.groupBy({
      by: ['ipAddress'],
      where: {
        success: false,
        attemptedAt: {
          gte: oneHourAgo,
        },
      },
      _count: {
        ipAddress: true,
      },
      having: {
        ipAddress: {
          _count: {
            gte: threshold,
          },
        },
      },
      orderBy: {
        _count: {
          ipAddress: 'desc',
        },
      },
    });

    return suspiciousIPs.map((ip) => ({
      ip: ip.ipAddress,
      failures: ip._count.ipAddress,
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
