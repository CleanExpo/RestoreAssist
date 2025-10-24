import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserPayload, AuthTokens } from '../types';
import { freeTrialService } from './freeTrialService';
import { userRepository } from '../repositories/userRepository';
import { tokenRepository } from '../repositories/tokenRepository';
import { db } from '../db/connection';

// Test mode access attempt logging interface
interface TestModeAccessAttempt {
  id?: string;
  email: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  errorCode: string;
}

// JWT configuration - CRITICAL: These MUST be set via environment variables
const JWT_SECRET: string = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET!;
const JWT_EXPIRY: string = process.env.JWT_EXPIRY || '15m'; // Access token expiry
const JWT_REFRESH_EXPIRY: string = process.env.JWT_REFRESH_EXPIRY || '7d'; // Refresh token expiry

// Validate that JWT secrets are configured
if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables');
}

// Validate that secrets are not using default/example values
const UNSAFE_SECRET_PATTERNS = [
  'your-secret-key',
  'change-in-production',
  'EXAMPLE',
  'CHANGE_THIS',
  'your-refresh-secret'
];

if (UNSAFE_SECRET_PATTERNS.some(pattern =>
  JWT_SECRET.toLowerCase().includes(pattern.toLowerCase()) ||
  JWT_REFRESH_SECRET.toLowerCase().includes(pattern.toLowerCase())
)) {
  throw new Error('CRITICAL SECURITY ERROR: JWT secrets are using unsafe default/example values. Generate proper secrets!');
}

export class AuthServiceDb {
  /**
   * Register a new user
   */
  async registerUser(email: string, password: string, name: string, role: 'admin' | 'user' | 'viewer' | 'premium' = 'user'): Promise<User> {
    // Check if user exists
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new Error('User already exists');
    }

    // Create user in database
    const user = await userRepository.create({
      email,
      password, // Will be hashed by repository
      name,
      role
    });

    return user;
  }

  /**
   * Authenticate user and generate tokens
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    // Find user by email
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await userRepository.updateLastLogin(user.userId);

    // Generate tokens
    return this.generateTokens(user);
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload: UserPayload = {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    // Generate access token
    const accessToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: this.parseExpiryToSeconds(JWT_EXPIRY),
    });

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.userId },
      JWT_REFRESH_SECRET,
      { expiresIn: this.parseExpiryToSeconds(JWT_REFRESH_EXPIRY) }
    );

    // Store refresh token in database
    const expiresAt = new Date(Date.now() + this.parseExpiryToSeconds(JWT_REFRESH_EXPIRY) * 1000);
    await tokenRepository.create({
      userId: user.userId,
      token: refreshToken,
      expiresAt
    });

    // Calculate expiry time in seconds
    const expiresIn = this.parseExpiryToSeconds(JWT_EXPIRY);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    // Validate refresh token in database
    const isValid = await tokenRepository.validate(refreshToken);
    if (!isValid) {
      throw new Error('Invalid refresh token');
    }

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string };

      // Get user
      const user = await userRepository.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Revoke old refresh token
      await tokenRepository.revoke(refreshToken);

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      // Revoke invalid token
      await tokenRepository.revoke(refreshToken);
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): UserPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as UserPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Logout user (invalidate refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    await tokenRepository.revoke(refreshToken);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    return userRepository.findById(userId);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return userRepository.findByEmail(email);
  }

  /**
   * Update user last login
   */
  async updateLastLogin(userId: string): Promise<void> {
    await userRepository.updateLastLogin(userId);
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      throw new Error('Invalid current password');
    }

    // Update password
    await userRepository.updatePassword(userId, newPassword);
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<boolean> {
    return userRepository.delete(userId);
  }

  /**
   * List all users (admin only)
   */
  async listUsers(): Promise<User[]> {
    const users = await userRepository.findAll();
    return users.map(user => ({
      ...user,
      password: '[REDACTED]', // Don't expose passwords
    }));
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15 minutes

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 900;
    }
  }

  /**
   * Initialize with default admin user (for development)
   */
  async initializeDefaultUsers(): Promise<void> {
    console.log('🔍 [AUTH] initializeDefaultUsers() called');

    try {
      await userRepository.initializeDefaultUsers();
    } catch (error) {
      console.error('Error initializing default users:', error);
    }
  }

  /**
   * Get total user count
   */
  async getUserCount(): Promise<number> {
    return userRepository.count();
  }

  /**
   * Get active refresh tokens count
   */
  async getActiveTokenCount(): Promise<number> {
    return tokenRepository.countActive();
  }

  /**
   * Log test mode access attempt (for non-whitelisted users)
   */
  async logTestModeAccessAttempt(
    email: string,
    errorCode: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // Store in database auth_attempts table
      await db.none(
        `INSERT INTO auth_attempts (email, ip_address, user_agent, success, failure_reason, attempt_type)
         VALUES ($1, $2, $3, false, $4, 'login')`,
        [email, ipAddress || '0.0.0.0', userAgent || null, `Test mode: ${errorCode}`]
      );

      console.log(
        `⚠️ [TEST MODE ACCESS ATTEMPT] ${email} (${errorCode}) - ${ipAddress || 'unknown IP'}`
      );
    } catch (error) {
      console.error('Error logging test mode access attempt:', error);
    }
  }

  /**
   * Get all test mode access attempts
   */
  async getTestModeAccessAttempts(limit: number = 50): Promise<TestModeAccessAttempt[]> {
    try {
      const attempts = await db.manyOrNone<TestModeAccessAttempt>(
        `SELECT
           id,
           email,
           timestamp::text as timestamp,
           ip_address::text as "ipAddress",
           user_agent as "userAgent",
           failure_reason as "errorCode"
         FROM auth_attempts
         WHERE failure_reason LIKE 'Test mode:%'
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      );

      return attempts || [];
    } catch (error) {
      console.error('Error getting test mode access attempts:', error);
      return [];
    }
  }

  /**
   * Get test mode access attempts for a specific email
   */
  async getTestModeAccessAttemptsByEmail(email: string): Promise<TestModeAccessAttempt[]> {
    try {
      const attempts = await db.manyOrNone<TestModeAccessAttempt>(
        `SELECT
           id,
           email,
           timestamp::text as timestamp,
           ip_address::text as "ipAddress",
           user_agent as "userAgent",
           failure_reason as "errorCode"
         FROM auth_attempts
         WHERE email = $1 AND failure_reason LIKE 'Test mode:%'
         ORDER BY timestamp DESC`,
        [email]
      );

      return attempts || [];
    } catch (error) {
      console.error('Error getting test mode access attempts by email:', error);
      return [];
    }
  }

  /**
   * Clear test mode access attempt logs
   */
  async clearTestModeAccessAttempts(): Promise<void> {
    try {
      await db.none(
        `DELETE FROM auth_attempts WHERE failure_reason LIKE 'Test mode:%'`
      );
      console.log('✅ Test mode access attempt logs cleared');
    } catch (error) {
      console.error('Error clearing test mode access attempts:', error);
    }
  }

  /**
   * Check trial eligibility for a user
   */
  async checkTrialEligibility(
    userId: string,
    email: string,
    fingerprintHash: string,
    deviceData: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    eligible: boolean;
    tokenId?: string;
    reportsRemaining?: number;
    expiresAt?: Date;
    fraudFlags?: any[];
    denialReason?: string;
  }> {
    try {
      // Call freeTrialService to activate trial with fraud detection
      const result = await freeTrialService.activateTrial({
        userId,
        fingerprintHash,
        deviceData,
        ipAddress,
        userAgent,
      });

      if (result.success) {
        console.log(`✅ Trial activated for user ${userId} (${email})`);
        return {
          eligible: true,
          tokenId: result.tokenId,
          reportsRemaining: result.reportsRemaining,
          expiresAt: result.expiresAt,
        };
      } else {
        console.log(`⚠️ Trial denied for user ${userId} (${email}): ${result.denialReason}`);
        return {
          eligible: false,
          fraudFlags: result.fraudFlags,
          denialReason: result.denialReason,
        };
      }
    } catch (error) {
      console.error('Error checking trial eligibility:', error);
      throw new Error('Failed to check trial eligibility');
    }
  }

  /**
   * Check if user has an active trial
   */
  async hasActiveTrial(userId: string): Promise<boolean> {
    try {
      const trial = await freeTrialService.getTrialStatus(userId);
      return trial !== null;
    } catch (error) {
      console.error('Error checking active trial:', error);
      return false;
    }
  }

  /**
   * Cleanup expired tokens and sessions (should be run periodically)
   */
  async cleanup(): Promise<void> {
    try {
      const deletedTokens = await tokenRepository.deleteExpired();
      console.log(`🧹 Cleaned up ${deletedTokens} expired refresh tokens`);

      // Clean expired sessions if we have sessionRepository
      // const deletedSessions = await sessionRepository.deleteExpired();
      // console.log(`🧹 Cleaned up ${deletedSessions} expired sessions`);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Singleton instance
export const authServiceDb = new AuthServiceDb();