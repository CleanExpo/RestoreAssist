import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserPayload, AuthTokens } from '../types';
import { freeTrialService } from './freeTrialService';

// In-memory user storage (replace with database in production)
const users: Map<string, User> = new Map();

// In-memory refresh token storage (use Redis in production)
const refreshTokens: Set<string> = new Set();

// In-memory test mode access attempt logging (use database in production)
interface TestModeAccessAttempt {
  email: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  errorCode: string;
}

const testModeAccessAttempts: TestModeAccessAttempt[] = [];

// JWT configuration
const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_EXPIRY: string = process.env.JWT_EXPIRY || '15m'; // Access token expiry
const JWT_REFRESH_EXPIRY: string = process.env.JWT_REFRESH_EXPIRY || '7d'; // Refresh token expiry

export class AuthService {
  /**
   * Register a new user (for initial setup/testing)
   */
  async registerUser(email: string, password: string, name: string, role: 'admin' | 'user' | 'viewer' = 'user'): Promise<User> {
    // Check if user exists
    const existing = Array.from(users.values()).find(u => u.email === email);
    if (existing) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user: User = {
      userId: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      email,
      password: hashedPassword,
      name,
      role,
      createdAt: new Date().toISOString(),
    };

    users.set(user.userId, user);
    return user;
  }

  /**
   * Authenticate user and generate tokens
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    // Find user by email
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    users.set(user.userId, user);

    // Generate tokens
    return this.generateTokens(user);
  }

  /**
   * Generate access and refresh tokens
   */
  private generateTokens(user: User): AuthTokens {
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

    // Store refresh token
    refreshTokens.add(refreshToken);

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
    // Check if refresh token exists in storage
    if (!refreshTokens.has(refreshToken)) {
      throw new Error('Invalid refresh token');
    }

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string };

      // Get user
      const user = users.get(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Remove old refresh token
      refreshTokens.delete(refreshToken);

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      // Remove invalid token
      refreshTokens.delete(refreshToken);
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
  logout(refreshToken: string): void {
    refreshTokens.delete(refreshToken);
  }

  /**
   * Get user by ID
   */
  getUserById(userId: string): User | undefined {
    return users.get(userId);
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): User | undefined {
    return Array.from(users.values()).find(u => u.email === email);
  }

  /**
   * Update user last login
   */
  updateLastLogin(userId: string): void {
    const user = users.get(userId);
    if (user) {
      user.lastLogin = new Date().toISOString();
      users.set(userId, user);
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);
    users.set(userId, user);
  }

  /**
   * Delete user
   */
  deleteUser(userId: string): boolean {
    return users.delete(userId);
  }

  /**
   * List all users (admin only)
   */
  listUsers(): User[] {
    return Array.from(users.values()).map(user => ({
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
   * Initialise with default admin user (for development)
   */
  async initializeDefaultUsers(): Promise<void> {
    console.log('🔍 [AUTH] initializeDefaultUsers() called');
    console.log(`🔍 [AUTH] Current user count before init: ${users.size}`);

    // Check if admin exists
    const adminExists = Array.from(users.values()).some(u => u.role === 'admin');
    console.log(`🔍 [AUTH] Admin exists: ${adminExists}`);
    if (!adminExists) {
      console.log('🔍 [AUTH] Creating admin user...');
      await this.registerUser('admin@restoreassist.com', 'admin123', 'Admin User', 'admin');
      console.log('✅ Default admin user created: admin@restoreassist.com / admin123');
    }

    // Create demo user
    const demoUserExists = this.getUserByEmail('demo@restoreassist.com');
    console.log(`🔍 [AUTH] Demo user exists: ${demoUserExists !== undefined}`);
    if (!demoUserExists) {
      console.log('🔍 [AUTH] Creating demo user...');
      await this.registerUser('demo@restoreassist.com', 'demo123', 'Demo User', 'user');
      console.log('✅ Demo user created: demo@restoreassist.com / demo123');
    }

    console.log(`🔍 [AUTH] Final user count after init: ${users.size}`);
    console.log(`🔍 [AUTH] Users: ${Array.from(users.values()).map(u => u.email).join(', ')}`);
  }

  /**
   * Get total user count
   */
  getUserCount(): number {
    return users.size;
  }

  /**
   * Get active refresh tokens count
   */
  getActiveTokenCount(): number {
    return refreshTokens.size;
  }

  /**
   * Log test mode access attempt (for non-whitelisted users)
   *
   * @param email - Email address that attempted access
   * @param errorCode - OAuth error code ('access_blocked' or 'org_internal')
   * @param ipAddress - Optional IP address of the request
   * @param userAgent - Optional user agent string
   */
  logTestModeAccessAttempt(
    email: string,
    errorCode: string,
    ipAddress?: string,
    userAgent?: string
  ): void {
    const attempt: TestModeAccessAttempt = {
      email,
      timestamp: new Date().toISOString(),
      ipAddress,
      userAgent,
      errorCode,
    };

    testModeAccessAttempts.push(attempt);

    // Keep only last 100 attempts (prevent memory overflow)
    if (testModeAccessAttempts.length > 100) {
      testModeAccessAttempts.shift();
    }

    // Log to console for admin visibility
    console.log(
      `⚠️ [TEST MODE ACCESS ATTEMPT] ${email} (${errorCode}) - ${ipAddress || 'unknown IP'}`
    );
  }

  /**
   * Get all test mode access attempts
   *
   * @param limit - Optional limit on number of results (default: 50)
   * @returns Array of test mode access attempts
   */
  getTestModeAccessAttempts(limit: number = 50): TestModeAccessAttempt[] {
    return testModeAccessAttempts.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get test mode access attempts for a specific email
   *
   * @param email - Email address to filter by
   * @returns Array of test mode access attempts for the email
   */
  getTestModeAccessAttemptsByEmail(email: string): TestModeAccessAttempt[] {
    return testModeAccessAttempts.filter(a => a.email === email).reverse();
  }

  /**
   * Clear test mode access attempt logs
   * (Admin utility function)
   */
  clearTestModeAccessAttempts(): void {
    testModeAccessAttempts.length = 0;
    console.log('✅ Test mode access attempt logs cleared');
  }

  /**
   * Check trial eligibility for a user
   *
   * @param userId - User ID to check
   * @param email - User's email address
   * @param fingerprintHash - Device fingerprint hash
   * @param deviceData - Device fingerprinting data
   * @param ipAddress - Optional IP address
   * @param userAgent - Optional user agent string
   * @returns Trial activation result with fraud check details
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
   *
   * @param userId - User ID to check
   * @returns Whether user has an active trial
   */
  async hasActiveTrial(userId: string): Promise<boolean> {
    try {
      const trial = await freeTrialService.getActiveTrialByUserId(userId);
      return trial !== null;
    } catch (error) {
      console.error('Error checking active trial:', error);
      return false;
    }
  }
}

// Singleton instance
export const authService = new AuthService();
