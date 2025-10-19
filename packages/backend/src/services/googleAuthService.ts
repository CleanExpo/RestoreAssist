import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import jwt from 'jsonwebtoken';
import { User } from './freeTrialService';

// =====================================================
// Types & Interfaces
// =====================================================

export interface GoogleUserInfo {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  locale?: string;
}

export interface LoginSession {
  sessionId: string;
  userId: string;
  ipAddress?: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  userAgent?: string;
  sessionToken: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface GoogleAuthResult {
  success: boolean;
  user?: User;
  tokens?: AuthTokens;
  session?: LoginSession;
  error?: string;
}

// =====================================================
// Configuration
// =====================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const JWT_REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
const SESSION_EXPIRY_DAYS = 7;

// =====================================================
// Google Auth Service
// =====================================================

class GoogleAuthService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );
  }

  /**
   * Verify Google ID token and extract user info
   */
  async verifyGoogleToken(idToken: string): Promise<GoogleUserInfo | null> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return null;
      }

      return {
        sub: payload.sub,
        email: payload.email || '',
        email_verified: payload.email_verified || false,
        name: payload.name,
        picture: payload.picture,
        locale: payload.locale,
      };
    } catch (error) {
      console.error('Google token verification failed:', error);
      return null;
    }
  }

  /**
   * Create or update user from Google sign-in
   */
  async createOrUpdateUser(googleUser: GoogleUserInfo): Promise<User> {
    // Check if user exists
    const existingUser = await db.oneOrNone<User>(
      `SELECT * FROM users WHERE google_id = $1`,
      [googleUser.sub]
    );

    if (existingUser) {
      // Update existing user
      const updatedUser = await db.one<User>(
        `UPDATE users
         SET email = $1,
             name = $2,
             picture_url = $3,
             email_verified = $4,
             locale = $5,
             last_login_at = NOW(),
             updated_at = NOW()
         WHERE google_id = $6
         RETURNING *`,
        [
          googleUser.email,
          googleUser.name || null,
          googleUser.picture || null,
          googleUser.email_verified,
          googleUser.locale || null,
          googleUser.sub,
        ]
      );

      return updatedUser;
    }

    // Create new user
    const newUser = await db.one<User>(
      `INSERT INTO users
       (user_id, google_id, email, name, picture_url, email_verified, locale, created_at, last_login_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        uuidv4(),
        googleUser.sub,
        googleUser.email,
        googleUser.name || null,
        googleUser.picture || null,
        googleUser.email_verified,
        googleUser.locale || null,
      ]
    );

    return newUser;
  }

  /**
   * Generate JWT access and refresh tokens
   */
  generateTokens(user: User): AuthTokens {
    const accessToken = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_TOKEN_EXPIRY }
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
      const user = await db.oneOrNone<User>(
        `SELECT * FROM users WHERE user_id = $1`,
        [decoded.userId]
      );

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
   * Create login session with IP tracking
   */
  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginSession> {
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // TODO: Integrate with IP geolocation service for country/region/city/timezone
    // For now, we'll leave those fields null

    const session = await db.one<LoginSession>(
      `INSERT INTO login_sessions
       (session_id, user_id, ip_address, user_agent, session_token, created_at, expires_at, last_activity_at, is_active)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), true)
       RETURNING *`,
      [uuidv4(), userId, ipAddress || null, userAgent || null, sessionToken, expiresAt]
    );

    return session;
  }

  /**
   * Get session by token
   */
  async getSessionByToken(sessionToken: string): Promise<LoginSession | null> {
    const session = await db.oneOrNone<LoginSession>(
      `SELECT * FROM login_sessions
       WHERE session_token = $1 AND is_active = true AND expires_at > NOW()`,
      [sessionToken]
    );

    if (session) {
      // Update last activity
      await db.none(
        `UPDATE login_sessions SET last_activity_at = NOW() WHERE session_id = $1`,
        [session.sessionId]
      );
    }

    return session;
  }

  /**
   * Invalidate session (logout)
   */
  async invalidateSession(sessionToken: string): Promise<boolean> {
    const result = await db.result(
      `UPDATE login_sessions SET is_active = false WHERE session_token = $1`,
      [sessionToken]
    );

    return result.rowCount > 0;
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<number> {
    const result = await db.result(
      `UPDATE login_sessions SET is_active = false WHERE user_id = $1`,
      [userId]
    );

    return result.rowCount;
  }

  /**
   * Complete Google OAuth flow
   */
  async handleGoogleLogin(
    idToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<GoogleAuthResult> {
    // Verify Google token
    const googleUser = await this.verifyGoogleToken(idToken);
    if (!googleUser) {
      return {
        success: false,
        error: 'Invalid Google ID token',
      };
    }

    // Create or update user
    const user = await this.createOrUpdateUser(googleUser);

    // Generate JWT tokens
    const tokens = this.generateTokens(user);

    // Create session
    const session = await this.createSession(user.userId, ipAddress, userAgent);

    return {
      success: true,
      user,
      tokens,
      session,
    };
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
      [email]
    );

    return user;
  }

  /**
   * Check if Google Auth is properly configured
   */
  isConfigured(): boolean {
    return !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET;
  }
}

// Singleton instance
export const googleAuthService = new GoogleAuthService();
