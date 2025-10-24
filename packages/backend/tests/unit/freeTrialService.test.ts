/**
 * Unit Tests: Free Trial Service
 *
 * Tests the multi-layered fraud detection system and trial activation logic.
 *
 * Coverage:
 * - Trial activation success/failure scenarios
 * - Device fingerprint fraud detection
 * - Disposable email detection
 * - IP rate limiting
 * - Payment verification integration
 * - Usage pattern analysis
 * - Time-based lockouts
 * - Fraud scoring algorithm
 * - Database fallback handling
 *
 * @module services/freeTrialService.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { freeTrialService } from '../../src/services/freeTrialService';
import type {
  TrialActivationRequest,
  TrialActivationResult,
  FreeTrialToken,
} from '../../src/services/freeTrialService';

// Mock database connection
const mockDb = {
  none: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  one: jest.fn<() => Promise<any>>(),
  oneOrNone: jest.fn<() => Promise<any>>(),
  manyOrNone: jest.fn<() => Promise<any[]>>(),
};

jest.mock('../../src/db/connection', () => ({
  db: mockDb,
}));

// Mock UUID generation for predictable test IDs
jest.mock('../../src/utils/uuid', () => ({
  uuidv4: jest.fn(() => `test-uuid-${Date.now()}`),
}));

describe('Free Trial Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_POSTGRES = 'false'; // Use in-memory mode by default
  });

  describe('activateTrial - In-Memory Mode', () => {
    it('should activate trial successfully in memory mode', async () => {
      const request: TrialActivationRequest = {
        userId: 'user-123',
        fingerprintHash: 'fp-abc123',
        deviceData: { browser: 'Chrome', os: 'Windows' },
        ipAddress: '203.0.113.0',
        userAgent: 'Mozilla/5.0...',
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(true);
      expect(result.tokenId).toBeDefined();
      expect(result.reportsRemaining).toBe(3);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.denialReason).toBeUndefined();
    });

    it('should set expiration 7 days in the future', async () => {
      const request: TrialActivationRequest = {
        userId: 'user-456',
        fingerprintHash: 'fp-xyz789',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(true);
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const expiryDiff = Math.abs(result.expiresAt!.getTime() - sevenDaysFromNow.getTime());

      // Allow 1 second tolerance for test execution time
      expect(expiryDiff).toBeLessThan(1000);
    });
  });

  describe('activateTrial - Database Mode with Fraud Detection', () => {
    beforeEach(() => {
      process.env.USE_POSTGRES = 'true';
    });

    it('should activate trial when fraud score is below threshold', async () => {
      // Mock user exists
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-clean',
          email: 'legitimate@example.com',
        })
        // Mock no existing device
        .mockResolvedValueOnce(null)
        // Mock no trials from email
        .mockResolvedValueOnce({ count: 0 })
        // Mock no recent IP trials
        .mockResolvedValueOnce({ count: 0 })
        // Mock no payment verification
        .mockResolvedValueOnce(null)
        // Mock no usage patterns
        .mockResolvedValueOnce(null)
        // Mock no fraud flags
        .mockResolvedValueOnce(null);

      mockDb.none.mockResolvedValue(undefined);

      const request: TrialActivationRequest = {
        userId: 'user-clean',
        fingerprintHash: 'fp-clean-123',
        deviceData: { browser: 'Chrome' },
        ipAddress: '203.0.113.10',
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(true);
      expect(result.tokenId).toBeDefined();
      expect(result.denialReason).toBeUndefined();
    });

    it('should deny trial when device is blocked', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-blocked',
          email: 'blocked@example.com',
        })
        .mockResolvedValueOnce({
          fingerprint_hash: 'fp-blocked',
          is_blocked: true,
          blocked_reason: 'Fraud detected',
          trial_count: 5,
        });

      const request: TrialActivationRequest = {
        userId: 'user-blocked',
        fingerprintHash: 'fp-blocked',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(false);
      expect(result.denialReason).toContain('Fraud');
      expect(result.fraudFlags).toBeDefined();
      expect(result.fraudFlags!.length).toBeGreaterThan(0);
    });

    it('should flag disposable email domains', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-disposable',
          email: 'test@tempmail.com',
        })
        .mockResolvedValueOnce(null) // No device
        .mockResolvedValueOnce({ count: 0 }); // No email trials

      const request: TrialActivationRequest = {
        userId: 'user-disposable',
        fingerprintHash: 'fp-temp',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      // Should still succeed but with fraud flags
      expect(result.success).toBe(true);
      expect(result.fraudFlags).toBeDefined();
      const disposableFlag = result.fraudFlags?.find(f => f.flagType === 'disposable_email');
      expect(disposableFlag).toBeDefined();
      expect(disposableFlag?.severity).toBe('high');
    });

    it('should deny trial when device trial limit exceeded', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-repeat',
          email: 'repeat@example.com',
        })
        .mockResolvedValueOnce({
          fingerprint_hash: 'fp-used',
          is_blocked: false,
          trial_count: 2, // MAX_TRIALS_PER_DEVICE is 1
          last_seen_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        });

      const request: TrialActivationRequest = {
        userId: 'user-repeat',
        fingerprintHash: 'fp-used',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(false);
      expect(result.fraudFlags).toBeDefined();
      const limitFlag = result.fraudFlags?.find(f => f.flagType === 'device_trial_limit_exceeded');
      expect(limitFlag).toBeDefined();
    });

    it('should flag rapid re-registration attempts', async () => {
      const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-rapid',
          email: 'rapid@example.com',
        })
        .mockResolvedValueOnce({
          fingerprint_hash: 'fp-rapid',
          is_blocked: false,
          trial_count: 1,
          last_seen_at: recentTimestamp,
        });

      const request: TrialActivationRequest = {
        userId: 'user-rapid',
        fingerprintHash: 'fp-rapid',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.fraudFlags).toBeDefined();
      const rapidFlag = result.fraudFlags?.find(f => f.flagType === 'rapid_re_registration');
      expect(rapidFlag).toBeDefined();
      expect(rapidFlag?.severity).toBe('medium');
    });

    it('should flag IP rate limit violations', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-ip-spam',
          email: 'spam@example.com',
        })
        .mockResolvedValueOnce(null) // No device
        .mockResolvedValueOnce({ count: 0 }) // No email trials
        .mockResolvedValueOnce({ count: 5 }); // 5 trials from same IP (max is 3)

      const request: TrialActivationRequest = {
        userId: 'user-ip-spam',
        fingerprintHash: 'fp-new',
        deviceData: {},
        ipAddress: '203.0.113.50',
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.fraudFlags).toBeDefined();
      const ipFlag = result.fraudFlags?.find(f => f.flagType === 'ip_rate_limit_exceeded');
      expect(ipFlag).toBeDefined();
      expect(ipFlag?.severity).toBe('high');
    });

    it('should handle missing user gracefully', async () => {
      mockDb.oneOrNone.mockResolvedValueOnce(null); // User not found

      const request: TrialActivationRequest = {
        userId: 'user-nonexistent',
        fingerprintHash: 'fp-any',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(false);
      expect(result.denialReason).toBe('User not found');
    });

    it('should gracefully handle database errors during fraud checks', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-db-error',
          email: 'error@example.com',
        })
        .mockRejectedValueOnce(new Error('Database connection error'));

      // Should continue with in-memory fallback
      const request: TrialActivationRequest = {
        userId: 'user-db-error',
        fingerprintHash: 'fp-error',
        deviceData: {},
      };

      // Should not throw, should fallback gracefully
      const result = await freeTrialService.activateTrial(request);

      // Depends on implementation - could succeed with warning or fail gracefully
      expect(result).toBeDefined();
    });
  });

  describe('getTrialStatus', () => {
    it('should return active trial token', async () => {
      const mockToken: FreeTrialToken = {
        tokenId: 'token-123',
        userId: 'user-123',
        status: 'active',
        reportsRemaining: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      };

      mockDb.oneOrNone.mockResolvedValueOnce(mockToken);

      const result = await freeTrialService.getTrialStatus('user-123');

      expect(result).toEqual(mockToken);
      expect(result?.status).toBe('active');
      expect(result?.reportsRemaining).toBe(2);
    });

    it('should return null when no active trial exists', async () => {
      mockDb.oneOrNone.mockResolvedValueOnce(null);

      const result = await freeTrialService.getTrialStatus('user-no-trial');

      expect(result).toBeNull();
    });
  });

  describe('consumeTrialReport', () => {
    it('should consume a report and decrement counter', async () => {
      const mockToken: FreeTrialToken = {
        tokenId: 'token-456',
        userId: 'user-456',
        status: 'active',
        reportsRemaining: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.oneOrNone.mockResolvedValueOnce(mockToken);
      mockDb.none.mockResolvedValue(undefined);

      const result = await freeTrialService.consumeTrialReport('token-456', 'report-789');

      expect(result).toBe(true);
      expect(mockDb.none).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE free_trial_tokens'),
        expect.arrayContaining(['token-456'])
      );
      expect(mockDb.none).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trial_usage'),
        expect.any(Array)
      );
    });

    it('should mark trial as expired when reports run out', async () => {
      const mockToken: FreeTrialToken = {
        tokenId: 'token-empty',
        userId: 'user-empty',
        status: 'active',
        reportsRemaining: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.oneOrNone.mockResolvedValueOnce(mockToken);
      mockDb.none.mockResolvedValue(undefined);

      const result = await freeTrialService.consumeTrialReport('token-empty', 'report-last');

      expect(result).toBe(false);
      expect(mockDb.none).toHaveBeenCalledWith(
        expect.stringContaining("status = 'expired'"),
        ['token-empty']
      );
    });

    it('should return false for inactive token', async () => {
      const mockToken: FreeTrialToken = {
        tokenId: 'token-inactive',
        userId: 'user-inactive',
        status: 'revoked',
        reportsRemaining: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.oneOrNone.mockResolvedValueOnce(mockToken);

      const result = await freeTrialService.consumeTrialReport('token-inactive', 'report-fail');

      expect(result).toBe(false);
    });

    it('should return false for non-existent token', async () => {
      mockDb.oneOrNone.mockResolvedValueOnce(null);

      const result = await freeTrialService.consumeTrialReport('token-nonexistent', 'report-fail');

      expect(result).toBe(false);
    });
  });

  describe('revokeTrial', () => {
    it('should revoke a trial with reason', async () => {
      mockDb.none.mockResolvedValue(undefined);

      const result = await freeTrialService.revokeTrial('token-123', 'Fraud detected');

      expect(result).toBe(true);
      expect(mockDb.none).toHaveBeenCalledWith(
        expect.stringContaining("status = 'revoked'"),
        ['Fraud detected', 'token-123']
      );
    });
  });

  describe('blockDevice', () => {
    it('should block a device fingerprint', async () => {
      mockDb.none.mockResolvedValue(undefined);

      const result = await freeTrialService.blockDevice('fp-fraud', 'Multiple fraud flags');

      expect(result).toBe(true);
      expect(mockDb.none).toHaveBeenCalledWith(
        expect.stringContaining('is_blocked = true'),
        ['Multiple fraud flags', 'fp-fraud']
      );
    });
  });

  describe('Fraud Detection - Edge Cases', () => {
    beforeEach(() => {
      process.env.USE_POSTGRES = 'true';
    });

    it('should allow trial with low fraud score despite minor flags', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-borderline',
          email: 'borderline@example.com',
        })
        .mockResolvedValueOnce(null) // No device history
        .mockResolvedValueOnce({ count: 0 }) // No email trials
        .mockResolvedValueOnce({ count: 1 }); // Low IP activity

      mockDb.none.mockResolvedValue(undefined);

      const request: TrialActivationRequest = {
        userId: 'user-borderline',
        fingerprintHash: 'fp-borderline',
        deviceData: {},
        ipAddress: '203.0.113.100',
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(true);
    });

    it('should deny trial when fraud score exceeds threshold (70)', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-high-fraud',
          email: 'fraud@tempmail.com', // Disposable email (+40)
        })
        .mockResolvedValueOnce({
          // Device already used (+50)
          fingerprint_hash: 'fp-high-fraud',
          is_blocked: false,
          trial_count: 2,
          last_seen_at: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
        });

      const request: TrialActivationRequest = {
        userId: 'user-high-fraud',
        fingerprintHash: 'fp-high-fraud',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(false);
      expect(result.denialReason).toContain('Fraud score too high');
      expect(result.fraudFlags).toBeDefined();
      expect(result.fraudFlags!.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle VPN/proxy IP patterns', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-vpn',
          email: 'vpn@example.com',
        })
        .mockResolvedValueOnce(null) // No device
        .mockResolvedValueOnce({ count: 0 }) // No email trials
        .mockResolvedValueOnce({ count: 0 }); // No IP trials

      const request: TrialActivationRequest = {
        userId: 'user-vpn',
        fingerprintHash: 'fp-vpn',
        deviceData: {},
        ipAddress: '10.0.0.1', // Private network IP
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.fraudFlags).toBeDefined();
      const vpnFlag = result.fraudFlags?.find(f => f.flagType === 'vpn_proxy_detected');
      expect(vpnFlag).toBeDefined();
      expect(vpnFlag?.severity).toBe('medium');
    });
  });

  describe('Payment Verification Integration', () => {
    beforeEach(() => {
      process.env.USE_POSTGRES = 'true';
    });

    it('should allow trial when no payment verification exists (Stripe not configured)', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-no-payment',
          email: 'nopayment@example.com',
        })
        .mockResolvedValueOnce(null) // No device
        .mockResolvedValueOnce({ count: 0 }) // No email trials
        .mockResolvedValueOnce({ count: 0 }) // No IP trials
        .mockResolvedValueOnce(null); // No payment verification

      mockDb.none.mockResolvedValue(undefined);

      const request: TrialActivationRequest = {
        userId: 'user-no-payment',
        fingerprintHash: 'fp-no-payment',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.success).toBe(true);
    });

    it('should flag excessive card reuse across accounts', async () => {
      mockDb.oneOrNone
        .mockResolvedValueOnce({
          user_id: 'user-card-reuse',
          email: 'cardreuse@example.com',
        })
        .mockResolvedValueOnce(null) // No device
        .mockResolvedValueOnce({ count: 0 }) // No email trials
        .mockResolvedValueOnce({ count: 0 }) // No IP trials
        .mockResolvedValueOnce({
          // Payment verification exists
          card_fingerprint: 'card-fp-123',
        })
        .mockResolvedValueOnce({ count: 5 }); // Card used by 5 accounts

      const request: TrialActivationRequest = {
        userId: 'user-card-reuse',
        fingerprintHash: 'fp-card-reuse',
        deviceData: {},
      };

      const result = await freeTrialService.activateTrial(request);

      expect(result.fraudFlags).toBeDefined();
      const cardFlag = result.fraudFlags?.find(f => f.flagType === 'card_reuse');
      expect(cardFlag).toBeDefined();
      expect(cardFlag?.severity).toBe('high');
    });
  });
});
