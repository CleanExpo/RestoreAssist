import { db, pgp } from '../db/connection';
import bcrypt from 'bcryptjs';
import { uuidv4 } from '../utils/uuid';

export interface User {
  userId: string;
  email: string;
  password: string; // hashed
  name: string;
  role: 'admin' | 'user' | 'viewer' | 'premium';
  createdAt: string;
  lastLogin?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  resetToken?: string;
  resetTokenExpires?: string;
}

export interface CreateUserDto {
  email: string;
  password: string; // plain text - will be hashed
  name: string;
  role?: 'admin' | 'user' | 'viewer' | 'premium';
}

export interface UpdateUserDto {
  name?: string;
  role?: 'admin' | 'user' | 'viewer' | 'premium';
  lastLogin?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  resetToken?: string;
  resetTokenExpires?: string;
}

class UserRepository {
  /**
   * Create a new user
   */
  async create(data: CreateUserDto): Promise<User> {
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await db.one<User>(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, email_verified)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, false)
       RETURNING
         id as "userId",
         email,
         password_hash as password,
         name,
         role,
         created_at as "createdAt",
         last_login as "lastLogin",
         email_verified as "emailVerified",
         email_verified_at as "emailVerifiedAt",
         reset_token as "resetToken",
         reset_token_expires as "resetTokenExpires"`,
      [
        userId,
        data.email.toLowerCase(),
        hashedPassword,
        data.name,
        data.role || 'user'
      ]
    );

    return user;
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    const user = await db.oneOrNone<User>(
      `SELECT
         id as "userId",
         email,
         password_hash as password,
         name,
         role,
         created_at as "createdAt",
         last_login as "lastLogin",
         email_verified as "emailVerified",
         email_verified_at as "emailVerifiedAt",
         reset_token as "resetToken",
         reset_token_expires as "resetTokenExpires"
       FROM users
       WHERE id = $1`,
      [userId]
    );

    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const user = await db.oneOrNone<User>(
      `SELECT
         id as "userId",
         email,
         password_hash as password,
         name,
         role,
         created_at as "createdAt",
         last_login as "lastLogin",
         email_verified as "emailVerified",
         email_verified_at as "emailVerifiedAt",
         reset_token as "resetToken",
         reset_token_expires as "resetTokenExpires"
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    return user;
  }

  /**
   * Update user
   */
  async update(userId: string, data: UpdateUserDto): Promise<User | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${paramCount++}`);
      values.push(data.name);
    }

    if (data.role !== undefined) {
      sets.push(`role = $${paramCount++}`);
      values.push(data.role);
    }

    if (data.lastLogin !== undefined) {
      sets.push(`last_login = $${paramCount++}`);
      values.push(data.lastLogin);
    }

    if (data.emailVerified !== undefined) {
      sets.push(`email_verified = $${paramCount++}`);
      values.push(data.emailVerified);
    }

    if (data.emailVerifiedAt !== undefined) {
      sets.push(`email_verified_at = $${paramCount++}`);
      values.push(data.emailVerifiedAt);
    }

    if (data.resetToken !== undefined) {
      sets.push(`reset_token = $${paramCount++}`);
      values.push(data.resetToken || null);
    }

    if (data.resetTokenExpires !== undefined) {
      sets.push(`reset_token_expires = $${paramCount++}`);
      values.push(data.resetTokenExpires || null);
    }

    if (sets.length === 0) {
      return this.findById(userId);
    }

    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const user = await db.oneOrNone<User>(
      `UPDATE users
       SET ${sets.join(', ')}
       WHERE id = $${paramCount}
       RETURNING
         id as "userId",
         email,
         password_hash as password,
         name,
         role,
         created_at as "createdAt",
         last_login as "lastLogin",
         email_verified as "emailVerified",
         email_verified_at as "emailVerifiedAt",
         reset_token as "resetToken",
         reset_token_expires as "resetTokenExpires"`,
      values
    );

    return user;
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await db.result(
      `UPDATE users
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Verify user password
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    return bcrypt.compare(password, user.password);
  }

  /**
   * Delete user
   */
  async delete(userId: string): Promise<boolean> {
    const result = await db.result(
      `DELETE FROM users WHERE id = $1`,
      [userId]
    );

    return result.rowCount > 0;
  }

  /**
   * List all users
   */
  async findAll(): Promise<User[]> {
    const users = await db.manyOrNone<User>(
      `SELECT
         id as "userId",
         email,
         password_hash as password,
         name,
         role,
         created_at as "createdAt",
         last_login as "lastLogin",
         email_verified as "emailVerified",
         email_verified_at as "emailVerifiedAt",
         reset_token as "resetToken",
         reset_token_expires as "resetTokenExpires"
       FROM users
       ORDER BY created_at DESC`
    );

    return users || [];
  }

  /**
   * Count total users
   */
  async count(): Promise<number> {
    const result = await db.one<{ count: string }>(
      `SELECT COUNT(*) as count FROM users`
    );

    return parseInt(result.count, 10);
  }

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const result = await db.one<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists`,
      [email.toLowerCase()]
    );

    return result.exists;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await db.none(
      `UPDATE users
       SET last_login = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Initialize default users (for development/testing)
   */
  async initializeDefaultUsers(): Promise<void> {
    try {
      // Check if admin exists
      const adminExists = await this.existsByEmail('admin@restoreassist.com');

      if (!adminExists) {
        await this.create({
          email: 'admin@restoreassist.com',
          password: 'admin123',
          name: 'Admin User',
          role: 'admin'
        });
        console.log('✅ Default admin user created: admin@restoreassist.com / admin123');
      }

      // Create demo user
      const demoExists = await this.existsByEmail('demo@restoreassist.com');

      if (!demoExists) {
        await this.create({
          email: 'demo@restoreassist.com',
          password: 'demo123',
          name: 'Demo User',
          role: 'user'
        });
        console.log('✅ Demo user created: demo@restoreassist.com / demo123');
      }
    } catch (error) {
      console.error('Error initializing default users:', error);
    }
  }
}

export const userRepository = new UserRepository();