import { db } from '../db/connection';
import { uuidv4 } from '../utils/uuid';

export interface LoginSession {
  sessionId: string;
  userId: string;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

export interface CreateSessionDto {
  userId: string;
  sessionToken?: string;
  ipAddress?: string;
  userAgent?: string;
  expiryDays?: number;
}

export interface UpdateSessionDto {
  lastActivityAt?: Date;
  isActive?: boolean;
  expiresAt?: Date;
}

class SessionRepository {
  /**
   * Create a new session
   */
  async create(data: CreateSessionDto): Promise<LoginSession> {
    const sessionId = uuidv4();
    const sessionToken = data.sessionToken || uuidv4();
    const expiryDays = data.expiryDays || 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const session = await db.one<LoginSession>(
      `INSERT INTO login_sessions
       (session_id, user_id, session_token, ip_address, user_agent, created_at, expires_at, last_activity_at, is_active)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP, true)
       RETURNING
         session_id as "sessionId",
         user_id as "userId",
         session_token as "sessionToken",
         ip_address as "ipAddress",
         user_agent as "userAgent",
         created_at as "createdAt",
         expires_at as "expiresAt",
         last_activity_at as "lastActivityAt",
         is_active as "isActive"`,
      [
        sessionId,
        data.userId,
        sessionToken,
        data.ipAddress || null,
        data.userAgent || null,
        expiresAt
      ]
    );

    return session;
  }

  /**
   * Find session by ID
   */
  async findById(sessionId: string): Promise<LoginSession | null> {
    const session = await db.oneOrNone<LoginSession>(
      `SELECT
         session_id as "sessionId",
         user_id as "userId",
         session_token as "sessionToken",
         ip_address as "ipAddress",
         user_agent as "userAgent",
         created_at as "createdAt",
         expires_at as "expiresAt",
         last_activity_at as "lastActivityAt",
         is_active as "isActive"
       FROM login_sessions
       WHERE session_id = $1`,
      [sessionId]
    );

    return session;
  }

  /**
   * Find session by token
   */
  async findByToken(sessionToken: string): Promise<LoginSession | null> {
    const session = await db.oneOrNone<LoginSession>(
      `SELECT
         session_id as "sessionId",
         user_id as "userId",
         session_token as "sessionToken",
         ip_address as "ipAddress",
         user_agent as "userAgent",
         created_at as "createdAt",
         expires_at as "expiresAt",
         last_activity_at as "lastActivityAt",
         is_active as "isActive"
       FROM login_sessions
       WHERE session_token = $1`,
      [sessionToken]
    );

    return session;
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(userId: string): Promise<LoginSession[]> {
    const sessions = await db.manyOrNone<LoginSession>(
      `SELECT
         session_id as "sessionId",
         user_id as "userId",
         session_token as "sessionToken",
         ip_address as "ipAddress",
         user_agent as "userAgent",
         created_at as "createdAt",
         expires_at as "expiresAt",
         last_activity_at as "lastActivityAt",
         is_active as "isActive"
       FROM login_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return sessions || [];
  }

  /**
   * Find active sessions for a user
   */
  async findActiveByUserId(userId: string): Promise<LoginSession[]> {
    const sessions = await db.manyOrNone<LoginSession>(
      `SELECT
         session_id as "sessionId",
         user_id as "userId",
         session_token as "sessionToken",
         ip_address as "ipAddress",
         user_agent as "userAgent",
         created_at as "createdAt",
         expires_at as "expiresAt",
         last_activity_at as "lastActivityAt",
         is_active as "isActive"
       FROM login_sessions
       WHERE user_id = $1
         AND is_active = true
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_activity_at DESC`,
      [userId]
    );

    return sessions || [];
  }

  /**
   * Update session
   */
  async update(sessionId: string, data: UpdateSessionDto): Promise<LoginSession | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.lastActivityAt !== undefined) {
      sets.push(`last_activity_at = $${paramCount++}`);
      values.push(data.lastActivityAt);
    }

    if (data.isActive !== undefined) {
      sets.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    if (data.expiresAt !== undefined) {
      sets.push(`expires_at = $${paramCount++}`);
      values.push(data.expiresAt);
    }

    if (sets.length === 0) {
      return this.findById(sessionId);
    }

    values.push(sessionId);

    const session = await db.oneOrNone<LoginSession>(
      `UPDATE login_sessions
       SET ${sets.join(', ')}
       WHERE session_id = $${paramCount}
       RETURNING
         session_id as "sessionId",
         user_id as "userId",
         session_token as "sessionToken",
         ip_address as "ipAddress",
         user_agent as "userAgent",
         created_at as "createdAt",
         expires_at as "expiresAt",
         last_activity_at as "lastActivityAt",
         is_active as "isActive"`,
      values
    );

    return session;
  }

  /**
   * Update session activity
   */
  async updateActivity(sessionToken: string): Promise<boolean> {
    const result = await db.result(
      `UPDATE login_sessions
       SET last_activity_at = CURRENT_TIMESTAMP
       WHERE session_token = $1 AND is_active = true`,
      [sessionToken]
    );

    return result.rowCount > 0;
  }

  /**
   * Validate session (check if exists, active, not expired)
   */
  async validate(sessionToken: string): Promise<boolean> {
    const result = await db.oneOrNone<{ valid: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM login_sessions
         WHERE session_token = $1
           AND is_active = true
           AND expires_at > CURRENT_TIMESTAMP
       ) as valid`,
      [sessionToken]
    );

    return result?.valid || false;
  }

  /**
   * Invalidate session
   */
  async invalidate(sessionToken: string): Promise<boolean> {
    const result = await db.result(
      `UPDATE login_sessions
       SET is_active = false
       WHERE session_token = $1`,
      [sessionToken]
    );

    return result.rowCount > 0;
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllForUser(userId: string): Promise<number> {
    const result = await db.result(
      `UPDATE login_sessions
       SET is_active = false
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    return result.rowCount;
  }

  /**
   * Delete expired sessions (cleanup)
   */
  async deleteExpired(): Promise<number> {
    const result = await db.result(
      `DELETE FROM login_sessions
       WHERE expires_at < CURRENT_TIMESTAMP
         OR (is_active = false AND last_activity_at < CURRENT_TIMESTAMP - INTERVAL '30 days')`
    );

    return result.rowCount;
  }

  /**
   * Count active sessions
   */
  async countActive(): Promise<number> {
    const result = await db.one<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM login_sessions
       WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP`
    );

    return parseInt(result.count, 10);
  }

  /**
   * Count sessions for a user
   */
  async countForUser(userId: string): Promise<number> {
    const result = await db.one<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM login_sessions
       WHERE user_id = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP`,
      [userId]
    );

    return parseInt(result.count, 10);
  }

  /**
   * Delete session
   */
  async delete(sessionId: string): Promise<boolean> {
    const result = await db.result(
      `DELETE FROM login_sessions WHERE session_id = $1`,
      [sessionId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get session with user info (for auth middleware)
   */
  async getSessionWithUser(sessionToken: string): Promise<{ session: LoginSession; user: any } | null> {
    const result = await db.oneOrNone(
      `SELECT
         s.session_id as "sessionId",
         s.user_id as "userId",
         s.session_token as "sessionToken",
         s.ip_address as "ipAddress",
         s.user_agent as "userAgent",
         s.created_at as "sessionCreatedAt",
         s.expires_at as "sessionExpiresAt",
         s.last_activity_at as "sessionLastActivityAt",
         s.is_active as "sessionIsActive",
         u.id as "userId",
         u.email,
         u.name,
         u.role,
         u.email_verified as "emailVerified"
       FROM login_sessions s
       INNER JOIN users u ON s.user_id = u.id
       WHERE s.session_token = $1
         AND s.is_active = true
         AND s.expires_at > CURRENT_TIMESTAMP`,
      [sessionToken]
    );

    if (!result) return null;

    return {
      session: {
        sessionId: result.sessionId,
        userId: result.userId,
        sessionToken: result.sessionToken,
        ipAddress: result.ipAddress,
        userAgent: result.userAgent,
        createdAt: result.sessionCreatedAt,
        expiresAt: result.sessionExpiresAt,
        lastActivityAt: result.sessionLastActivityAt,
        isActive: result.sessionIsActive
      },
      user: {
        userId: result.userId,
        email: result.email,
        name: result.name,
        role: result.role,
        emailVerified: result.emailVerified
      }
    };
  }
}

export const sessionRepository = new SessionRepository();