import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserPayload, AuthTokens } from '../types';
import { freeTrialService } from './freeTrialService';
import { authServiceDb } from './authServiceDb';

// Check if database is available
const USE_DATABASE = process.env.USE_POSTGRES === 'true';

// In production, database MUST be enabled
if (process.env.NODE_ENV === 'production' && !USE_DATABASE) {
  throw new Error('CRITICAL: Database must be enabled in production (USE_POSTGRES=true)');
}

// In-memory user storage (fallback when database not available)
const users: Map<string, User> = new Map();

// In-memory refresh token storage (fallback when database not available)
const refreshTokens: Set<string> = new Set();

// In-memory test mode access attempt logging (fallback when database not available)
interface TestModeAccessAttempt {
  email: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  errorCode: string;
}

const testModeAccessAttempts: TestModeAccessAttempt[] = [];

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

export class AuthService {
  /**
   * Register a new user (for initial setup/testing)
   */
  async registerUser(email: string, password: string, name: string, role: 'admin' | 'user' | 'viewer' = 'user'): Promise<User> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.registerUser(email, password, name, role as any);
    }

    // Fallback to in-memory storage
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
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.login(email, password);
    }

    // Fallback to in-memory storage
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
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.refreshAccessToken(refreshToken);
    }

    // Fallback to in-memory storage
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
    // This doesn't need database, same for both
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
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.logout(refreshToken);
    }

    // Fallback to in-memory storage
    refreshTokens.delete(refreshToken);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | undefined | null> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.getUserById(userId);
    }

    // Fallback to in-memory storage
    return users.get(userId);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | undefined | null> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.getUserByEmail(email);
    }

    // Fallback to in-memory storage
    return Array.from(users.values()).find(u => u.email === email);
  }

  /**
   * Update user last login
   */
  async updateLastLogin(userId: string): Promise<void> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.updateLastLogin(userId);
    }

    // Fallback to in-memory storage
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
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.changePassword(userId, oldPassword, newPassword);
    }

    // Fallback to in-memory storage
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
  async deleteUser(userId: string): Promise<boolean> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.deleteUser(userId);
    }

    // Fallback to in-memory storage
    return users.delete(userId);
  }

  /**
   * List all users (admin only)
   */
  async listUsers(): Promise<User[]> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.listUsers();
    }

    // Fallback to in-memory storage
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
   * Initialize with default admin user (for development)
   */
  async initializeDefaultUsers(): Promise<void> {
    console.log('🔍 [AUTH] initializeDefaultUsers() called');

    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.initializeDefaultUsers();
    }

    // Fallback to in-memory storage
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
    const demoUserExists = await this.getUserByEmail('demo@restoreassist.com');
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
  async getUserCount(): Promise<number> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.getUserCount();
    }

    // Fallback to in-memory storage
    return users.size;
  }

  /**
   * Get active refresh tokens count
   */
  async getActiveTokenCount(): Promise<number> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.getActiveTokenCount();
    }

    // Fallback to in-memory storage
    return refreshTokens.size;
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
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.logTestModeAccessAttempt(email, errorCode, ipAddress, userAgent);
    }

    // Fallback to in-memory storage
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
   */
  async getTestModeAccessAttempts(limit: number = 50): Promise<TestModeAccessAttempt[]> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.getTestModeAccessAttempts(limit);
    }

    // Fallback to in-memory storage
    return testModeAccessAttempts.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get test mode access attempts for a specific email
   */
  async getTestModeAccessAttemptsByEmail(email: string): Promise<TestModeAccessAttempt[]> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.getTestModeAccessAttemptsByEmail(email);
    }

    // Fallback to in-memory storage
    return testModeAccessAttempts.filter(a => a.email === email).reverse();
  }

  /**
   * Clear test mode access attempt logs
   */
  async clearTestModeAccessAttempts(): Promise<void> {
    // Use database if available
    if (USE_DATABASE) {
      return authServiceDb.clearTestModeAccessAttempts();
    }

    // Fallback to in-memory storage
    testModeAccessAttempts.length = 0;
    console.log('✅ Test mode access attempt logs cleared');
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
    // This always uses freeTrialService which handles its own database logic
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
    // This always uses freeTrialService which handles its own database logic
    try {
      const trial = await freeTrialService.getTrialStatus(userId);
      return trial !== null;
    } catch (error) {
      console.error('Error checking active trial:', error);
      return false;
    }
  }
}

// Singleton instance
export const authService = new AuthService();

// Export helper to check if running in database mode
export const isDatabaseMode = (): boolean => USE_DATABASE;