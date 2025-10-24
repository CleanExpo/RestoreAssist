import { db } from '../db/connection';
import { uuidv4 } from '../utils/uuid';
import jwt from 'jsonwebtoken';

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
  isRevoked: boolean;
  userAgent?: string;
  ipAddress?: string;
}

export interface CreateTokenDto {
  userId: string;
  token: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

class TokenRepository {
  /**
   * Create a new refresh token
   */
  async create(data: CreateTokenDto): Promise<RefreshToken> {
    const tokenId = uuidv4();

    const refreshToken = await db.one<RefreshToken>(
      `INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at, is_revoked, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, false, $5, $6)
       RETURNING
         id,
         user_id as "userId",
         token,
         expires_at as "expiresAt",
         created_at as "createdAt",
         revoked_at as "revokedAt",
         is_revoked as "isRevoked",
         user_agent as "userAgent",
         ip_address as "ipAddress"`,
      [
        tokenId,
        data.userId,
        data.token,
        data.expiresAt,
        data.userAgent || null,
        data.ipAddress || null
      ]
    );

    return refreshToken;
  }

  /**
   * Find token by token string
   */
  async findByToken(token: string): Promise<RefreshToken | null> {
    const refreshToken = await db.oneOrNone<RefreshToken>(
      `SELECT
         id,
         user_id as "userId",
         token,
         expires_at as "expiresAt",
         created_at as "createdAt",
         revoked_at as "revokedAt",
         is_revoked as "isRevoked",
         user_agent as "userAgent",
         ip_address as "ipAddress"
       FROM refresh_tokens
       WHERE token = $1`,
      [token]
    );

    return refreshToken;
  }

  /**
   * Find all tokens for a user
   */
  async findByUserId(userId: string): Promise<RefreshToken[]> {
    const tokens = await db.manyOrNone<RefreshToken>(
      `SELECT
         id,
         user_id as "userId",
         token,
         expires_at as "expiresAt",
         created_at as "createdAt",
         revoked_at as "revokedAt",
         is_revoked as "isRevoked",
         user_agent as "userAgent",
         ip_address as "ipAddress"
       FROM refresh_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return tokens || [];
  }

  /**
   * Validate token (check if exists, not revoked, not expired)
   */
  async validate(token: string): Promise<boolean> {
    const result = await db.oneOrNone<{ valid: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM refresh_tokens
         WHERE token = $1
           AND is_revoked = false
           AND expires_at > CURRENT_TIMESTAMP
       ) as valid`,
      [token]
    );

    return result?.valid || false;
  }

  /**
   * Revoke a token
   */
  async revoke(token: string): Promise<boolean> {
    const result = await db.result(
      `UPDATE refresh_tokens
       SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE token = $1`,
      [token]
    );

    return result.rowCount > 0;
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await db.result(
      `UPDATE refresh_tokens
       SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_revoked = false`,
      [userId]
    );

    return result.rowCount;
  }

  /**
   * Delete expired tokens (cleanup)
   */
  async deleteExpired(): Promise<number> {
    const result = await db.result(
      `DELETE FROM refresh_tokens
       WHERE expires_at < CURRENT_TIMESTAMP
         OR (is_revoked = true AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '7 days')`
    );

    return result.rowCount;
  }

  /**
   * Count active tokens
   */
  async countActive(): Promise<number> {
    const result = await db.one<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM refresh_tokens
       WHERE is_revoked = false AND expires_at > CURRENT_TIMESTAMP`
    );

    return parseInt(result.count, 10);
  }

  /**
   * Count tokens for a user
   */
  async countForUser(userId: string): Promise<number> {
    const result = await db.one<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM refresh_tokens
       WHERE user_id = $1 AND is_revoked = false AND expires_at > CURRENT_TIMESTAMP`,
      [userId]
    );

    return parseInt(result.count, 10);
  }

  /**
   * Delete token
   */
  async delete(token: string): Promise<boolean> {
    const result = await db.result(
      `DELETE FROM refresh_tokens WHERE token = $1`,
      [token]
    );

    return result.rowCount > 0;
  }

  /**
   * Cleanup old tokens for a user (keep only N most recent)
   */
  async cleanupUserTokens(userId: string, keepCount: number = 5): Promise<number> {
    // Delete all but the N most recent tokens
    const result = await db.result(
      `DELETE FROM refresh_tokens
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM refresh_tokens
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         )`,
      [userId, keepCount]
    );

    return result.rowCount;
  }
}

export const tokenRepository = new TokenRepository();