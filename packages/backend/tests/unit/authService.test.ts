/**
 * Unit Tests: Authentication Service
 *
 * Tests user authentication, token management, and session handling.
 *
 * Coverage:
 * - User registration
 * - Login/logout flows
 * - Password validation
 * - JWT token generation and verification
 * - Refresh token rotation
 * - Password change
 * - User management operations
 * - Test mode access logging
 * - Trial eligibility checking
 *
 * @module services/authService.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthService } from '../../src/services/authService';
import type { User, AuthTokens } from '../../src/types';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn((password: string) => Promise.resolve(`hashed_${password}`)),
  compare: jest.fn((password: string, hash: string) => {
    return Promise.resolve(hash === `hashed_${password}`);
  }),
}));

// Mock freeTrialService
const mockActivateTrial = jest.fn();
const mockGetTrialStatus = jest.fn();

jest.mock('../../src/services/freeTrialService', () => ({
  freeTrialService: {
    activateTrial: mockActivateTrial,
    getTrialStatus: mockGetTrialStatus,
  },
}));

describe('Authentication Service', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
  });

  describe('registerUser', () => {
    it('should register a new user with hashed password', async () => {
      const user = await authService.registerUser(
        'test@example.com',
        'password123',
        'Test User',
        'user'
      );

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('user');
      expect(user.password).toBe('hashed_password123');
      expect(user.userId).toMatch(/^user-\d+-/);
      expect(user.createdAt).toBeDefined();
    });

    it('should register user with default role "user"', async () => {
      const user = await authService.registerUser(
        'default@example.com',
        'password123',
        'Default User'
      );

      expect(user.role).toBe('user');
    });

    it('should allow registering admin users', async () => {
      const admin = await authService.registerUser(
        'admin@example.com',
        'adminpass',
        'Admin User',
        'admin'
      );

      expect(admin.role).toBe('admin');
    });

    it('should throw error when user already exists', async () => {
      await authService.registerUser('duplicate@example.com', 'pass123', 'First User');

      await expect(
        authService.registerUser('duplicate@example.com', 'pass456', 'Second User')
      ).rejects.toThrow('User already exists');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.registerUser('login@example.com', 'correctpassword', 'Login User');
    });

    it('should login successfully with correct credentials', async () => {
      const tokens = await authService.login('login@example.com', 'correctpassword');

      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeGreaterThan(0);
    });

    it('should throw error with incorrect password', async () => {
      await expect(
        authService.login('login@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw error with non-existent email', async () => {
      await expect(
        authService.login('nonexistent@example.com', 'anypassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should update lastLogin timestamp on successful login', async () => {
      const beforeLogin = Date.now();
      await authService.login('login@example.com', 'correctpassword');

      const user = authService.getUserByEmail('login@example.com');
      expect(user?.lastLogin).toBeDefined();

      const lastLoginTime = new Date(user!.lastLogin!).getTime();
      expect(lastLoginTime).toBeGreaterThanOrEqual(beforeLogin);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', async () => {
      await authService.registerUser('tokenuser@example.com', 'pass123', 'Token User');
      const tokens = await authService.login('tokenuser@example.com', 'pass123');

      const payload = authService.verifyAccessToken(tokens.accessToken);

      expect(payload).toBeDefined();
      expect(payload.email).toBe('tokenuser@example.com');
      expect(payload.userId).toBeDefined();
      expect(payload.role).toBe('user');
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        authService.verifyAccessToken('invalid.token.here');
      }).toThrow('Invalid or expired token');
    });

    it('should throw error for malformed token', () => {
      expect(() => {
        authService.verifyAccessToken('not-even-a-jwt');
      }).toThrow('Invalid or expired token');
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new tokens with valid refresh token', async () => {
      await authService.registerUser('refresh@example.com', 'pass123', 'Refresh User');
      const originalTokens = await authService.login('refresh@example.com', 'pass123');

      const newTokens = await authService.refreshAccessToken(originalTokens.refreshToken);

      expect(newTokens).toBeDefined();
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(originalTokens.accessToken);
      expect(newTokens.refreshToken).not.toBe(originalTokens.refreshToken);
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(
        authService.refreshAccessToken('invalid-refresh-token')
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should invalidate old refresh token after rotation', async () => {
      await authService.registerUser('rotation@example.com', 'pass123', 'Rotation User');
      const originalTokens = await authService.login('rotation@example.com', 'pass123');

      await authService.refreshAccessToken(originalTokens.refreshToken);

      // Old token should no longer work
      await expect(
        authService.refreshAccessToken(originalTokens.refreshToken)
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error when user is deleted after token issued', async () => {
      await authService.registerUser('deleted@example.com', 'pass123', 'Deleted User');
      const tokens = await authService.login('deleted@example.com', 'pass123');

      const user = authService.getUserByEmail('deleted@example.com');
      authService.deleteUser(user!.userId);

      await expect(
        authService.refreshAccessToken(tokens.refreshToken)
      ).rejects.toThrow('User not found');
    });
  });

  describe('logout', () => {
    it('should invalidate refresh token on logout', async () => {
      await authService.registerUser('logout@example.com', 'pass123', 'Logout User');
      const tokens = await authService.login('logout@example.com', 'pass123');

      authService.logout(tokens.refreshToken);

      await expect(
        authService.refreshAccessToken(tokens.refreshToken)
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('getUserById and getUserByEmail', () => {
    it('should retrieve user by ID', async () => {
      const registered = await authService.registerUser(
        'getbyid@example.com',
        'pass123',
        'Get By ID'
      );

      const user = authService.getUserById(registered.userId);

      expect(user).toBeDefined();
      expect(user?.email).toBe('getbyid@example.com');
    });

    it('should retrieve user by email', async () => {
      await authService.registerUser('getbyemail@example.com', 'pass123', 'Get By Email');

      const user = authService.getUserByEmail('getbyemail@example.com');

      expect(user).toBeDefined();
      expect(user?.email).toBe('getbyemail@example.com');
    });

    it('should return undefined for non-existent user ID', () => {
      const user = authService.getUserById('non-existent-id');
      expect(user).toBeUndefined();
    });

    it('should return undefined for non-existent email', () => {
      const user = authService.getUserByEmail('nonexistent@example.com');
      expect(user).toBeUndefined();
    });
  });

  describe('changePassword', () => {
    beforeEach(async () => {
      await authService.registerUser('changepass@example.com', 'oldpassword', 'Change Pass User');
    });

    it('should change password successfully with correct old password', async () => {
      const user = authService.getUserByEmail('changepass@example.com');

      await authService.changePassword(user!.userId, 'oldpassword', 'newpassword');

      // Should be able to login with new password
      const tokens = await authService.login('changepass@example.com', 'newpassword');
      expect(tokens).toBeDefined();
    });

    it('should throw error with incorrect old password', async () => {
      const user = authService.getUserByEmail('changepass@example.com');

      await expect(
        authService.changePassword(user!.userId, 'wrongoldpassword', 'newpassword')
      ).rejects.toThrow('Invalid current password');
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        authService.changePassword('non-existent-id', 'oldpass', 'newpass')
      ).rejects.toThrow('User not found');
    });

    it('should not allow login with old password after change', async () => {
      const user = authService.getUserByEmail('changepass@example.com');

      await authService.changePassword(user!.userId, 'oldpassword', 'newpassword');

      await expect(
        authService.login('changepass@example.com', 'oldpassword')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('deleteUser', () => {
    it('should delete existing user', async () => {
      const user = await authService.registerUser('delete@example.com', 'pass123', 'Delete User');

      const deleted = authService.deleteUser(user.userId);

      expect(deleted).toBe(true);
      expect(authService.getUserById(user.userId)).toBeUndefined();
    });

    it('should return false for non-existent user', () => {
      const deleted = authService.deleteUser('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('listUsers', () => {
    it('should list all users with redacted passwords', async () => {
      await authService.registerUser('list1@example.com', 'pass123', 'User 1');
      await authService.registerUser('list2@example.com', 'pass456', 'User 2');

      const users = authService.listUsers();

      expect(users.length).toBeGreaterThanOrEqual(2);
      users.forEach(user => {
        expect(user.password).toBe('[REDACTED]');
      });
    });

    it('should return empty array when no users exist', () => {
      const freshAuthService = new AuthService();
      const users = freshAuthService.listUsers();

      expect(users).toEqual([]);
    });
  });

  describe('getUserCount and getActiveTokenCount', () => {
    it('should return correct user count', async () => {
      const initialCount = authService.getUserCount();

      await authService.registerUser('count1@example.com', 'pass123', 'Count User 1');
      await authService.registerUser('count2@example.com', 'pass456', 'Count User 2');

      expect(authService.getUserCount()).toBe(initialCount + 2);
    });

    it('should return correct active token count', async () => {
      await authService.registerUser('token1@example.com', 'pass123', 'Token User 1');
      await authService.registerUser('token2@example.com', 'pass456', 'Token User 2');

      await authService.login('token1@example.com', 'pass123');
      await authService.login('token2@example.com', 'pass456');

      expect(authService.getActiveTokenCount()).toBeGreaterThanOrEqual(2);
    });

    it('should decrement token count on logout', async () => {
      await authService.registerUser('tokencount@example.com', 'pass123', 'Token Count User');
      const tokens = await authService.login('tokencount@example.com', 'pass123');

      const beforeLogout = authService.getActiveTokenCount();
      authService.logout(tokens.refreshToken);
      const afterLogout = authService.getActiveTokenCount();

      expect(afterLogout).toBe(beforeLogout - 1);
    });
  });

  describe('initializeDefaultUsers', () => {
    it('should create default admin and demo users', async () => {
      await authService.initializeDefaultUsers();

      const admin = authService.getUserByEmail('admin@restoreassist.com');
      const demo = authService.getUserByEmail('demo@restoreassist.com');

      expect(admin).toBeDefined();
      expect(admin?.role).toBe('admin');
      expect(demo).toBeDefined();
      expect(demo?.role).toBe('user');
    });

    it('should not duplicate users on multiple calls', async () => {
      await authService.initializeDefaultUsers();
      const firstCount = authService.getUserCount();

      await authService.initializeDefaultUsers();
      const secondCount = authService.getUserCount();

      expect(secondCount).toBe(firstCount);
    });
  });

  describe('Test Mode Access Logging', () => {
    it('should log test mode access attempts', () => {
      authService.logTestModeAccessAttempt(
        'blocked@example.com',
        'access_blocked',
        '203.0.113.1',
        'Mozilla/5.0...'
      );

      const attempts = authService.getTestModeAccessAttempts();

      expect(attempts.length).toBeGreaterThan(0);
      expect(attempts[0].email).toBe('blocked@example.com');
      expect(attempts[0].errorCode).toBe('access_blocked');
      expect(attempts[0].ipAddress).toBe('203.0.113.1');
    });

    it('should retrieve attempts for specific email', () => {
      authService.logTestModeAccessAttempt('user1@example.com', 'access_blocked');
      authService.logTestModeAccessAttempt('user2@example.com', 'org_internal');
      authService.logTestModeAccessAttempt('user1@example.com', 'access_blocked');

      const user1Attempts = authService.getTestModeAccessAttemptsByEmail('user1@example.com');

      expect(user1Attempts.length).toBe(2);
      user1Attempts.forEach((attempt: any) => {
        expect(attempt.email).toBe('user1@example.com');
      });
    });

    it('should limit stored attempts to 100', () => {
      for (let i = 0; i < 150; i++) {
        authService.logTestModeAccessAttempt(`user${i}@example.com`, 'access_blocked');
      }

      const attempts = authService.getTestModeAccessAttempts(200);

      expect(attempts.length).toBeLessThanOrEqual(100);
    });

    it('should clear all access attempt logs', () => {
      authService.logTestModeAccessAttempt('clear1@example.com', 'access_blocked');
      authService.logTestModeAccessAttempt('clear2@example.com', 'org_internal');

      authService.clearTestModeAccessAttempts();

      const attempts = authService.getTestModeAccessAttempts();
      expect(attempts.length).toBe(0);
    });
  });

  describe('Trial Eligibility Integration', () => {
    it('should check trial eligibility successfully', async () => {
      mockActivateTrial.mockResolvedValueOnce({
        success: true,
        tokenId: 'trial-token-123',
        reportsRemaining: 3,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await authService.checkTrialEligibility(
        'user-123',
        'eligible@example.com',
        'fp-123',
        { browser: 'Chrome' },
        '203.0.113.1',
        'Mozilla/5.0...'
      );

      expect(result.eligible).toBe(true);
      expect(result.tokenId).toBe('trial-token-123');
      expect(result.reportsRemaining).toBe(3);
      expect(mockActivateTrial).toHaveBeenCalledWith({
        userId: 'user-123',
        fingerprintHash: 'fp-123',
        deviceData: { browser: 'Chrome' },
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0...',
      });
    });

    it('should deny trial when fraud detected', async () => {
      mockActivateTrial.mockResolvedValueOnce({
        success: false,
        denialReason: 'Fraud score too high',
        fraudFlags: [{ flagType: 'device_blocked', severity: 'critical' }],
      });

      const result = await authService.checkTrialEligibility(
        'user-fraud',
        'fraud@example.com',
        'fp-fraud',
        {},
        '203.0.113.50'
      );

      expect(result.eligible).toBe(false);
      expect(result.denialReason).toBe('Fraud score too high');
      expect(result.fraudFlags).toBeDefined();
    });

    it('should check if user has active trial', async () => {
      mockGetTrialStatus.mockResolvedValueOnce({
        tokenId: 'active-trial',
        status: 'active',
        reportsRemaining: 2,
      });

      const hasActiveTrial = await authService.hasActiveTrial('user-123');

      expect(hasActiveTrial).toBe(true);
      expect(mockGetTrialStatus).toHaveBeenCalledWith('user-123');
    });

    it('should return false when no active trial exists', async () => {
      mockGetTrialStatus.mockResolvedValueOnce(null);

      const hasActiveTrial = await authService.hasActiveTrial('user-no-trial');

      expect(hasActiveTrial).toBe(false);
    });

    it('should handle trial eligibility check errors gracefully', async () => {
      mockActivateTrial.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        authService.checkTrialEligibility('user-error', 'error@example.com', 'fp-error', {})
      ).rejects.toThrow('Failed to check trial eligibility');
    });
  });

  describe('Token Expiry Parsing', () => {
    it('should generate tokens with correct expiry times', async () => {
      // Set custom expiry times via environment variables
      process.env.JWT_EXPIRY = '30m';
      process.env.JWT_REFRESH_EXPIRY = '14d';

      await authService.registerUser('expiry@example.com', 'pass123', 'Expiry User');
      const tokens = await authService.login('expiry@example.com', 'pass123');

      // Access token should expire in 30 minutes (1800 seconds)
      expect(tokens.expiresIn).toBe(1800);
    });
  });
});
