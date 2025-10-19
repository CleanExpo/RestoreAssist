import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import crypto from 'crypto';

// =====================================================
// Types & Interfaces
// =====================================================

export interface User {
  userId: string;
  googleId: string;
  email: string;
  name?: string;
  pictureUrl?: string;
  emailVerified: boolean;
  locale?: string;
  createdAt: Date;
  lastLoginAt?: Date;
  updatedAt: Date;
}

export interface FreeTrialToken {
  tokenId: string;
  userId: string;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  activatedAt?: Date;
  expiresAt?: Date;
  reportsRemaining: number;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
}

export interface DeviceFingerprint {
  fingerprintId: string;
  userId?: string;
  fingerprintHash: string;
  deviceData: Record<string, any>;
  trialCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isBlocked: boolean;
  blockedReason?: string;
}

export interface FraudFlag {
  flagId: string;
  userId?: string;
  fingerprintHash?: string;
  ipAddress?: string;
  flagType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fraudScore: number;
  details: Record<string, any>;
  createdAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolutionNote?: string;
}

export interface TrialActivationRequest {
  userId: string;
  fingerprintHash: string;
  deviceData: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface TrialActivationResult {
  success: boolean;
  tokenId?: string;
  reportsRemaining?: number;
  expiresAt?: Date;
  fraudFlags?: FraudFlag[];
  denialReason?: string;
}

export interface FraudCheckResult {
  allowed: boolean;
  fraudScore: number;
  flags: FraudFlag[];
  reason?: string;
}

// =====================================================
// Constants
// =====================================================

const TRIAL_DURATION_DAYS = 7;
const MAX_REPORTS_PER_TRIAL = 5;
const MAX_TRIALS_PER_DEVICE = 1;
const MAX_TRIALS_PER_EMAIL = 1;
const MAX_TRIALS_PER_IP_PER_DAY = 3;
const FRAUD_SCORE_THRESHOLD = 70; // 0-100 scale

// Disposable email domains (sample list)
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'getnada.com',
  'fakeinbox.com',
  'trashmail.com',
  'yopmail.com',
];

// VPN/Proxy detection patterns (simplified)
const SUSPICIOUS_IP_PATTERNS = [
  /^10\./, // Private network
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private network
  /^192\.168\./, // Private network
];

// =====================================================
// Free Trial Service
// =====================================================

class FreeTrialService {
  // =====================================================
  // LAYER 1: Device Fingerprinting Validation
  // =====================================================

  private async checkDeviceFingerprint(fingerprintHash: string): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fraudScore = 0;

    // Check if device exists and has trial history
    const device = await db.oneOrNone<DeviceFingerprint>(
      `SELECT * FROM device_fingerprints WHERE fingerprint_hash = $1`,
      [fingerprintHash]
    );

    if (device) {
      // Device has been seen before
      if (device.isBlocked) {
        flags.push({
          flagId: uuidv4(),
          fingerprintHash,
          flagType: 'device_blocked',
          severity: 'critical',
          fraudScore: 100,
          details: { reason: device.blockedReason || 'Device is blocked' },
          createdAt: new Date(),
          resolved: false,
        });
        return { allowed: false, fraudScore: 100, flags, reason: 'Device is blocked' };
      }

      if (device.trialCount >= MAX_TRIALS_PER_DEVICE) {
        fraudScore += 50;
        flags.push({
          flagId: uuidv4(),
          fingerprintHash,
          flagType: 'device_trial_limit_exceeded',
          severity: 'high',
          fraudScore: 50,
          details: { trialCount: device.trialCount, maxAllowed: MAX_TRIALS_PER_DEVICE },
          createdAt: new Date(),
          resolved: false,
        });
      }

      // Suspicious rapid re-registration
      const hoursSinceLastSeen = (Date.now() - new Date(device.lastSeenAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastSeen < 1 && device.trialCount > 0) {
        fraudScore += 30;
        flags.push({
          flagId: uuidv4(),
          fingerprintHash,
          flagType: 'rapid_re_registration',
          severity: 'medium',
          fraudScore: 30,
          details: { hoursSinceLastSeen, lastSeenAt: device.lastSeenAt },
          createdAt: new Date(),
          resolved: false,
        });
      }
    }

    return {
      allowed: fraudScore < FRAUD_SCORE_THRESHOLD,
      fraudScore,
      flags,
    };
  }

  // =====================================================
  // LAYER 2: Email Validation (Disposable Domains)
  // =====================================================

  private async checkEmailValidity(email: string, userId: string): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fraudScore = 0;

    // Check disposable email domain
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (DISPOSABLE_EMAIL_DOMAINS.includes(emailDomain)) {
      fraudScore += 40;
      flags.push({
        flagId: uuidv4(),
        userId,
        flagType: 'disposable_email',
        severity: 'high',
        fraudScore: 40,
        details: { email, domain: emailDomain },
        createdAt: new Date(),
        resolved: false,
      });
    }

    // Check for multiple trials from same email
    const existingTrials = await db.oneOrNone<{ count: number }>(
      `SELECT COUNT(*) as count FROM free_trial_tokens
       WHERE user_id IN (SELECT user_id FROM users WHERE email = $1)`,
      [email]
    );

    if (existingTrials && existingTrials.count >= MAX_TRIALS_PER_EMAIL) {
      fraudScore += 50;
      flags.push({
        flagId: uuidv4(),
        userId,
        flagType: 'email_trial_limit_exceeded',
        severity: 'high',
        fraudScore: 50,
        details: { email, trialCount: existingTrials.count, maxAllowed: MAX_TRIALS_PER_EMAIL },
        createdAt: new Date(),
        resolved: false,
      });
    }

    return {
      allowed: fraudScore < FRAUD_SCORE_THRESHOLD,
      fraudScore,
      flags,
    };
  }

  // =====================================================
  // LAYER 3: IP Rate Limiting & Analysis
  // =====================================================

  private async checkIpAddress(ipAddress: string, userId: string): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fraudScore = 0;

    if (!ipAddress) {
      return { allowed: true, fraudScore: 0, flags };
    }

    // Check for suspicious IP patterns (VPN/Proxy detection)
    const isSuspiciousIp = SUSPICIOUS_IP_PATTERNS.some(pattern => pattern.test(ipAddress));
    if (isSuspiciousIp) {
      fraudScore += 20;
      flags.push({
        flagId: uuidv4(),
        userId,
        ipAddress,
        flagType: 'vpn_proxy_detected',
        severity: 'medium',
        fraudScore: 20,
        details: { ipAddress, reason: 'Suspicious IP pattern detected' },
        createdAt: new Date(),
        resolved: false,
      });
    }

    // Check IP rate limiting (trials per day)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTrials = await db.oneOrNone<{ count: number }>(
      `SELECT COUNT(*) as count FROM login_sessions
       WHERE ip_address = $1 AND created_at > $2`,
      [ipAddress, oneDayAgo]
    );

    if (recentTrials && recentTrials.count >= MAX_TRIALS_PER_IP_PER_DAY) {
      fraudScore += 35;
      flags.push({
        flagId: uuidv4(),
        userId,
        ipAddress,
        flagType: 'ip_rate_limit_exceeded',
        severity: 'high',
        fraudScore: 35,
        details: {
          ipAddress,
          trialsInLast24Hours: recentTrials.count,
          maxAllowed: MAX_TRIALS_PER_IP_PER_DAY
        },
        createdAt: new Date(),
        resolved: false,
      });
    }

    return {
      allowed: fraudScore < FRAUD_SCORE_THRESHOLD,
      fraudScore,
      flags,
    };
  }

  // =====================================================
  // LAYER 4: Payment Verification Integration
  // =====================================================

  private async checkPaymentVerification(userId: string): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fraudScore = 0;

    // Check if user has verified payment method
    const paymentVerification = await db.oneOrNone(
      `SELECT * FROM payment_verifications
       WHERE user_id = $1 AND verification_status = 'success'
       ORDER BY verification_date DESC LIMIT 1`,
      [userId]
    );

    if (!paymentVerification) {
      // No payment verification - not a fraud flag, but noted
      return { allowed: true, fraudScore: 0, flags };
    }

    // Check for card reuse across multiple accounts
    const cardReuseCount = await db.oneOrNone<{ count: number }>(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM payment_verifications
       WHERE card_fingerprint = $1`,
      [paymentVerification.card_fingerprint]
    );

    if (cardReuseCount && cardReuseCount.count > 3) {
      fraudScore += 45;
      flags.push({
        flagId: uuidv4(),
        userId,
        flagType: 'card_reuse',
        severity: 'high',
        fraudScore: 45,
        details: {
          cardFingerprint: paymentVerification.card_fingerprint,
          reuseCount: cardReuseCount.count
        },
        createdAt: new Date(),
        resolved: false,
      });
    }

    return {
      allowed: fraudScore < FRAUD_SCORE_THRESHOLD,
      fraudScore,
      flags,
    };
  }

  // =====================================================
  // LAYER 5: Usage Pattern Analysis
  // =====================================================

  private async checkUsagePatterns(userId: string, fingerprintHash: string): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fraudScore = 0;

    // Check for rapid consumption patterns
    const recentUsage = await db.manyOrNone(
      `SELECT * FROM trial_usage
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    if (recentUsage && recentUsage.length >= 5) {
      // Check if all reports were generated within 1 hour
      const timestamps = recentUsage.map(u => new Date(u.created_at).getTime());
      const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
      const hoursSpan = timeSpan / (1000 * 60 * 60);

      if (hoursSpan < 1) {
        fraudScore += 25;
        flags.push({
          flagId: uuidv4(),
          userId,
          fingerprintHash,
          flagType: 'rapid_usage_pattern',
          severity: 'medium',
          fraudScore: 25,
          details: {
            reportsGenerated: recentUsage.length,
            timeSpanHours: hoursSpan
          },
          createdAt: new Date(),
          resolved: false,
        });
      }
    }

    return {
      allowed: fraudScore < FRAUD_SCORE_THRESHOLD,
      fraudScore,
      flags,
    };
  }

  // =====================================================
  // LAYER 6: Time-based Lockouts
  // =====================================================

  private async checkTimeLockouts(userId: string, fingerprintHash: string): Promise<FraudCheckResult> {
    const flags: FraudFlag[] = [];
    let fraudScore = 0;

    // Check if user has recent fraud flags
    const recentFlags = await db.manyOrNone<FraudFlag>(
      `SELECT * FROM trial_fraud_flags
       WHERE (user_id = $1 OR fingerprint_hash = $2)
       AND severity IN ('high', 'critical')
       AND resolved = false
       AND created_at > NOW() - INTERVAL '7 days'`,
      [userId, fingerprintHash]
    );

    if (recentFlags && recentFlags.length > 0) {
      const criticalFlags = recentFlags.filter(f => f.severity === 'critical');

      if (criticalFlags.length > 0) {
        fraudScore += 100;
        flags.push({
          flagId: uuidv4(),
          userId,
          fingerprintHash,
          flagType: 'critical_flags_detected',
          severity: 'critical',
          fraudScore: 100,
          details: {
            criticalFlagCount: criticalFlags.length,
            recentFlagCount: recentFlags.length
          },
          createdAt: new Date(),
          resolved: false,
        });
        return { allowed: false, fraudScore: 100, flags, reason: 'Critical fraud flags detected' };
      }

      if (recentFlags.length >= 3) {
        fraudScore += 60;
        flags.push({
          flagId: uuidv4(),
          userId,
          fingerprintHash,
          flagType: 'multiple_fraud_flags',
          severity: 'high',
          fraudScore: 60,
          details: { flagCount: recentFlags.length },
          createdAt: new Date(),
          resolved: false,
        });
      }
    }

    return {
      allowed: fraudScore < FRAUD_SCORE_THRESHOLD,
      fraudScore,
      flags,
    };
  }

  // =====================================================
  // LAYER 7: Fraud Scoring Algorithm
  // =====================================================

  private async calculateFraudScore(
    userId: string,
    email: string,
    fingerprintHash: string,
    ipAddress?: string
  ): Promise<FraudCheckResult> {
    // Run all fraud checks in parallel
    const [
      deviceCheck,
      emailCheck,
      ipCheck,
      paymentCheck,
      usageCheck,
      lockoutCheck,
    ] = await Promise.all([
      this.checkDeviceFingerprint(fingerprintHash),
      this.checkEmailValidity(email, userId),
      this.checkIpAddress(ipAddress || '', userId),
      this.checkPaymentVerification(userId),
      this.checkUsagePatterns(userId, fingerprintHash),
      this.checkTimeLockouts(userId, fingerprintHash),
    ]);

    // Aggregate all flags
    const allFlags = [
      ...deviceCheck.flags,
      ...emailCheck.flags,
      ...ipCheck.flags,
      ...paymentCheck.flags,
      ...usageCheck.flags,
      ...lockoutCheck.flags,
    ];

    // Calculate total fraud score
    const totalFraudScore = Math.min(
      100,
      deviceCheck.fraudScore +
      emailCheck.fraudScore +
      ipCheck.fraudScore +
      paymentCheck.fraudScore +
      usageCheck.fraudScore +
      lockoutCheck.fraudScore
    );

    // Determine if allowed
    const allowed =
      totalFraudScore < FRAUD_SCORE_THRESHOLD &&
      deviceCheck.allowed &&
      emailCheck.allowed &&
      ipCheck.allowed &&
      paymentCheck.allowed &&
      usageCheck.allowed &&
      lockoutCheck.allowed;

    const reason = !allowed
      ? `Fraud score too high: ${totalFraudScore}/100`
      : undefined;

    return {
      allowed,
      fraudScore: totalFraudScore,
      flags: allFlags,
      reason,
    };
  }

  // =====================================================
  // Public API Methods
  // =====================================================

  /**
   * Activate a free trial for a user
   */
  async activateTrial(request: TrialActivationRequest): Promise<TrialActivationResult> {
    const { userId, fingerprintHash, deviceData, ipAddress, userAgent } = request;

    // Get user details
    const user = await db.oneOrNone<User>(
      `SELECT * FROM users WHERE user_id = $1`,
      [userId]
    );

    if (!user) {
      return {
        success: false,
        denialReason: 'User not found',
      };
    }

    // Run fraud detection
    const fraudCheck = await this.calculateFraudScore(
      userId,
      user.email,
      fingerprintHash,
      ipAddress
    );

    // Save fraud flags to database
    if (fraudCheck.flags.length > 0) {
      for (const flag of fraudCheck.flags) {
        await db.none(
          `INSERT INTO trial_fraud_flags
           (flag_id, user_id, fingerprint_hash, ip_address, flag_type, severity, fraud_score, details, created_at, resolved)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            flag.flagId,
            flag.userId || null,
            flag.fingerprintHash || null,
            flag.ipAddress || null,
            flag.flagType,
            flag.severity,
            flag.fraudScore,
            JSON.stringify(flag.details),
            flag.createdAt,
            flag.resolved,
          ]
        );
      }
    }

    // Deny if fraud score too high
    if (!fraudCheck.allowed) {
      return {
        success: false,
        fraudFlags: fraudCheck.flags,
        denialReason: fraudCheck.reason || 'Fraud detection triggered',
      };
    }

    // Update or create device fingerprint
    const existingDevice = await db.oneOrNone(
      `SELECT * FROM device_fingerprints WHERE fingerprint_hash = $1`,
      [fingerprintHash]
    );

    if (existingDevice) {
      await db.none(
        `UPDATE device_fingerprints
         SET user_id = $1, trial_count = trial_count + 1, last_seen_at = NOW()
         WHERE fingerprint_hash = $2`,
        [userId, fingerprintHash]
      );
    } else {
      await db.none(
        `INSERT INTO device_fingerprints
         (fingerprint_id, user_id, fingerprint_hash, device_data, trial_count, first_seen_at, last_seen_at, is_blocked)
         VALUES ($1, $2, $3, $4, 1, NOW(), NOW(), false)`,
        [uuidv4(), userId, fingerprintHash, JSON.stringify(deviceData)]
      );
    }

    // Create trial token
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    await db.none(
      `INSERT INTO free_trial_tokens
       (token_id, user_id, status, activated_at, expires_at, reports_remaining, created_at, updated_at)
       VALUES ($1, $2, 'active', NOW(), $3, $4, NOW(), NOW())`,
      [tokenId, userId, expiresAt, MAX_REPORTS_PER_TRIAL]
    );

    return {
      success: true,
      tokenId,
      reportsRemaining: MAX_REPORTS_PER_TRIAL,
      expiresAt,
      fraudFlags: fraudCheck.flags.length > 0 ? fraudCheck.flags : undefined,
    };
  }

  /**
   * Check trial status for a user
   */
  async getTrialStatus(userId: string): Promise<FreeTrialToken | null> {
    const token = await db.oneOrNone<FreeTrialToken>(
      `SELECT * FROM free_trial_tokens
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    return token;
  }

  /**
   * Consume a trial report (decrement reports_remaining)
   */
  async consumeTrialReport(tokenId: string, reportId: string): Promise<boolean> {
    const token = await db.oneOrNone<FreeTrialToken>(
      `SELECT * FROM free_trial_tokens WHERE token_id = $1`,
      [tokenId]
    );

    if (!token || token.status !== 'active') {
      return false;
    }

    if (token.reportsRemaining <= 0) {
      // Mark as expired
      await db.none(
        `UPDATE free_trial_tokens SET status = 'expired' WHERE token_id = $1`,
        [tokenId]
      );
      return false;
    }

    // Decrement reports_remaining
    await db.none(
      `UPDATE free_trial_tokens
       SET reports_remaining = reports_remaining - 1
       WHERE token_id = $1`,
      [tokenId]
    );

    // Log usage
    await db.none(
      `INSERT INTO trial_usage
       (usage_id, token_id, user_id, report_id, action_type, created_at)
       VALUES ($1, $2, $3, $4, 'report_generated', NOW())`,
      [uuidv4(), tokenId, token.userId, reportId]
    );

    return true;
  }

  /**
   * Revoke a trial token (fraud or abuse)
   */
  async revokeTrial(tokenId: string, reason: string): Promise<boolean> {
    await db.none(
      `UPDATE free_trial_tokens
       SET status = 'revoked', revoked_at = NOW(), revoke_reason = $1
       WHERE token_id = $2`,
      [reason, tokenId]
    );

    return true;
  }

  /**
   * Block a device fingerprint
   */
  async blockDevice(fingerprintHash: string, reason: string): Promise<boolean> {
    await db.none(
      `UPDATE device_fingerprints
       SET is_blocked = true, blocked_reason = $1
       WHERE fingerprint_hash = $2`,
      [reason, fingerprintHash]
    );

    return true;
  }
}

// Singleton instance
export const freeTrialService = new FreeTrialService();
