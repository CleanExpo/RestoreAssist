import bcrypt from 'bcryptjs';
import { db } from '../db/connection';
import { uuidv4 } from '../utils/uuid';
import { User } from './freeTrialService';
import { googleAuthService, AuthTokens, LoginSession } from './googleAuthService';
import { authService } from './authService';

// =====================================================
// Configuration
// =====================================================

const BCRYPT_SALT_ROUNDS = 10;

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

      // Generate tokens using Google Auth Service (reuse existing token generation)
      const tokens = googleAuthService.generateTokens(newUser);

      // Create session using Google Auth Service (reuse existing session management)
      const session = await googleAuthService.createSession(newUser.userId, ipAddress, userAgent);

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

      // Generate tokens using Google Auth Service (reuse existing token generation)
      const tokens = googleAuthService.generateTokens(user);

      // Create session using Google Auth Service (reuse existing session management)
      const session = await googleAuthService.createSession(user.userId, ipAddress, userAgent);

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
}

// Singleton instance
export const emailAuthService = new EmailAuthService();
