import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection';
import { uuidv4 } from '../utils/uuid';
import { User } from './freeTrialService';
import { authService } from './authService';

// =====================================================
// Configuration
// =====================================================

const BCRYPT_SALT_ROUNDS = 10;
const JWT_SECRET: string = process.env.JWT_SECRET!;
const JWT_ACCESS_TOKEN_EXPIRY: string = '15m'; // 15 minutes
const JWT_REFRESH_TOKEN_EXPIRY: string = '7d'; // 7 days
const SESSION_EXPIRY_DAYS = 7;

// Validate JWT secret is configured
if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET must be set in environment variables');
}

// Validate secret is not using default/example value
const UNSAFE_PATTERNS = ['your-secret-key', 'EXAMPLE', 'CHANGE_THIS', 'change-in-production'];
if (UNSAFE_PATTERNS.some(pattern => JWT_SECRET.toLowerCase().includes(pattern.toLowerCase()))) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET is using unsafe default/example value. Generate a proper secret!');
}

// =====================================================
// Password Requirements
// =====================================================

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = {
  hasUpperCase: /[A-Z]/,
  hasLowerCase: /[a-z]/,
  hasNumber: /[0-9]/,
};

// =====================================================
// Types
// =====================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginSession {
  sessionId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  sessionToken: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface EmailSignupResult {
  success: boolean;
  user?: User;
  tokens?: AuthTokens;
  session?: LoginSession;
  error?: string;
}

export interface EmailLoginResult {
  success: boolean;
  user?: User;
  tokens?: AuthTokens;
  session?: LoginSession;
  error?: string;
}

// =====================================================
// Email Auth Service
// =====================================================

class EmailAuthService {
  /**
   * Validate password meets requirements
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    if (!PASSWORD_REGEX.hasUpperCase.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!PASSWORD_REGEX.hasLowerCase.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!PASSWORD_REGEX.hasNumber.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }


  /**
   * Sign up new user with email/password
   */
  async signupWithEmail(
    email: string,
    password: string,
    name?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<EmailSignupResult> {
    try {
      // Validate email
      if (!this.validateEmail(email)) {
        return {
          success: false,
          error: 'Invalid email format',
        };
      }

      // Validate password
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: passwordValidation.errors.join('. '),
        };
      }

      // Use in-memory storage when database is not available
      const useDatabase = process.env.USE_POSTGRES === 'true';
      let newUser: User;

      if (!useDatabase) {
        // Use in-memory storage via authService
        const existingUser = authService.getUserByEmail(email.toLowerCase());
        if (existingUser) {
          return {
            success: false,
            error: 'An account with this email already exists',
          };
        }

        // Create user in memory
        const inMemoryUser = await authService.registerUser(
          email.toLowerCase(),
          password,
          name || email.split('@')[0],
          'user'
        );

        // Convert to User type for compatibility
        newUser = {
          userId: inMemoryUser.userId,
          googleId: '',
          email: inMemoryUser.email,
          name: inMemoryUser.name,
          emailVerified: false,
          createdAt: new Date(inMemoryUser.createdAt),
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        } as User;
      } else {
        // Check if user already exists in database
        const existingUser = await db.oneOrNone<User>(
          `SELECT * FROM users WHERE email = $1`,
          [email.toLowerCase()]
        );

        if (existingUser) {
          return {
            success: false,
            error: 'An account with this email already exists',
          };
        }

        // Hash password
        const passwordHash = await this.hashPassword(password);

        // Create new user in database
        newUser = await db.one<User>(
          `INSERT INTO users
           (user_id, email, name, password_hash, email_verified, created_at, last_login_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
           RETURNING user_id as "userId",
                     google_id as "googleId",
                     email,
                     name,
                     picture_url as "pictureUrl",
                     email_verified as "emailVerified",
                     locale,
                     created_at as "createdAt",
                     last_login_at as "lastLoginAt",
                     updated_at as "updatedAt"`,
          [
            uuidv4(),
            email.toLowerCase(),
            name || null,
            passwordHash,
            false, // Email not verified yet
          ]
        );
      }

      // Generate tokens
      const tokens = this.generateTokens(newUser);

      // Create session
      const session = await this.createSession(newUser.userId, ipAddress, userAgent);

      return {
        success: true,
        user: newUser,
        tokens,
        session,
      };
    } catch (error) {
      console.error('Email signup error:', error);
      return {
        success: false,
        error: 'Failed to create account. Please try again.',
      };
    }
  }

  /**
   * Login with email/password
   */
  async loginWithEmail(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<EmailLoginResult> {
    try {
      // Use in-memory storage when database is not available
      const useDatabase = process.env.USE_POSTGRES === 'true';
      let user: User;

      if (!useDatabase) {
        // Use in-memory authentication via authService
        try {
          const tokens = await authService.login(email.toLowerCase(), password);
          const inMemoryUser = authService.getUserByEmail(email.toLowerCase());

          if (!inMemoryUser) {
            return {
              success: false,
              error: 'Invalid email or password',
            };
          }

          // Convert to User type for compatibility
          user = {
            userId: inMemoryUser.userId,
            googleId: '',
            email: inMemoryUser.email,
            name: inMemoryUser.name,
            emailVerified: false,
            createdAt: new Date(inMemoryUser.createdAt),
            lastLoginAt: inMemoryUser.lastLogin ? new Date(inMemoryUser.lastLogin) : undefined,
            updatedAt: new Date(),
          } as User;

          // Return early with in-memory tokens
          return {
            success: true,
            user,
            tokens,
            session: {
              sessionId: uuidv4(),
              userId: user.userId,
              sessionToken: uuidv4(),
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              lastActivityAt: new Date(),
              isActive: true,
            } as LoginSession,
          };
        } catch (error) {
          return {
            success: false,
            error: 'Invalid email or password',
          };
        }
      } else {
        // Get user by email from database (including password_hash for verification)
        const dbUser = await db.oneOrNone<User & { password_hash?: string }>(
          `SELECT user_id as "userId",
                  google_id as "googleId",
                  email,
                  name,
                  picture_url as "pictureUrl",
                  email_verified as "emailVerified",
                  locale,
                  created_at as "createdAt",
                  last_login_at as "lastLoginAt",
                  updated_at as "updatedAt",
                  password_hash
           FROM users WHERE email = $1`,
          [email.toLowerCase()]
        );

        if (!dbUser) {
          return {
            success: false,
            error: 'Invalid email or password',
          };
        }

        // Check if user has password hash (not a Google OAuth user)
        if (!dbUser.password_hash) {
          return {
            success: false,
            error: 'This account uses Google Sign In. Please sign in with Google.',
          };
        }

        // Verify password
        const isPasswordValid = await this.verifyPassword(password, dbUser.password_hash);

        if (!isPasswordValid) {
          return {
            success: false,
            error: 'Invalid email or password',
          };
        }

        // Update last login time
        await db.none(
          `UPDATE users SET last_login_at = NOW() WHERE user_id = $1`,
          [dbUser.userId]
        );

        user = dbUser;
      }

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Create session
      const session = await this.createSession(user.userId, ipAddress, userAgent);

      return {
        success: true,
        user,
        tokens,
        session,
      };
    } catch (error) {
      console.error('Email login error:', error);
      return {
        success: false,
        error: 'Login failed. Please try again.',
      };
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const user = await db.oneOrNone<User>(
      `SELECT * FROM users WHERE user_id = $1`,
      [userId]
    );

    return user;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const user = await db.oneOrNone<User>(
      `SELECT * FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    return user;
  }

  /**
   * Generate JWT access and refresh tokens
   */
  generateTokens(user: User): AuthTokens {
    const accessPayload: Record<string, string> = {
      userId: user.userId,
      email: user.email,
      ...(user.name && { name: user.name }),
    };

    const refreshPayload: Record<string, string> = {
      userId: user.userId,
      email: user.email,
    };

    const accessToken = jwt.sign(
      accessPayload,
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_TOKEN_EXPIRY } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      refreshPayload,
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_TOKEN_EXPIRY } as jwt.SignOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Verify JWT access token
   */
  verifyAccessToken(token: string): { userId: string; email: string; name?: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
        name?: string;
      };
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
        userId: string;
        email: string;
      };

      // Get user from database
      const user = await this.getUserById(decoded.userId);

      if (!user) {
        return null;
      }

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      return null;
    }
  }

  /**
   * Create login session
   */
  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginSession> {
    const sessionToken = uuidv4();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Check if database is enabled
    const useDatabase = process.env.USE_POSTGRES === 'true';

    if (!useDatabase) {
      // In-memory session (return mock session for testing)
      return {
        sessionId,
        userId,
        ipAddress,
        userAgent,
        sessionToken,
        createdAt: new Date(),
        expiresAt,
        lastActivityAt: new Date(),
        isActive: true,
      };
    }

    const session = await db.one<LoginSession>(
      `INSERT INTO login_sessions
       (session_id, user_id, ip_address, user_agent, session_token, created_at, expires_at, last_activity_at, is_active)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), true)
       RETURNING *`,
      [sessionId, userId, ipAddress || null, userAgent || null, sessionToken, expiresAt]
    );

    return session;
  }

  /**
   * Invalidate session (logout)
   */
  async invalidateSession(sessionToken: string): Promise<boolean> {
    // For now, we're using in-memory sessions managed by authService
    // In production, this would update the database
    const useDatabase = process.env.USE_POSTGRES === 'true';

    if (useDatabase) {
      const result = await db.result(
        `UPDATE login_sessions SET is_active = false WHERE session_token = $1`,
        [sessionToken]
      );
      return result.rowCount > 0;
    }

    // In-memory session invalidation - always return true for simplicity
    return true;
  }
}

// Singleton instance
export const emailAuthService = new EmailAuthService();
