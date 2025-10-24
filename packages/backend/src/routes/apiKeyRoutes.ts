/**
 * API Key Management Routes
 * Secure storage and retrieval of encrypted API keys
 * Keys are delivered via httpOnly cookies for security
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

// Get encryption key from environment or generate a stable one
const getEncryptionKey = (): Buffer => {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'default-dev-secret-change-in-production';
  return crypto.pbkdf2Sync(secret, 'api-key-salt', ITERATIONS, KEY_LENGTH, 'sha256');
};

// Database connection
let db: Pool | null = null;

const initDatabase = async () => {
  if (process.env.USE_POSTGRES === 'true') {
    try {
      db = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        database: process.env.DB_NAME || 'restoreassist',
        user: process.env.DB_USER || 'restoreassist',
        password: process.env.DB_PASSWORD || 'dev_password_change_me',
        max: 5,
      });

      // Create table for API keys if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL,
          service_name VARCHAR(100) NOT NULL,
          encrypted_key TEXT NOT NULL,
          key_hint VARCHAR(20), -- Last 4 characters of the key for identification
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP,
          usage_count INTEGER DEFAULT 0,
          UNIQUE(user_id, service_name)
        )
      `);

      // Create indexes
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id
        ON user_api_keys(user_id)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_user_api_keys_service
        ON user_api_keys(service_name)
      `);

      console.log('✅ API keys database initialized');
    } catch (error) {
      console.error('⚠️ Failed to initialize API keys database:', error);
      db = null;
    }
  }
};

// Initialize on module load
initDatabase().catch(console.error);

// Encryption helpers
const encrypt = (text: string): { encrypted: string; iv: string; tag: string } => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
};

const decrypt = (encryptedData: string, iv: string, tag: string): string => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

// Store encrypted key in database
const storeEncryptedKey = (encrypted: string, iv: string, tag: string): string => {
  // Combine iv, tag, and encrypted data into a single string
  return `${iv}:${tag}:${encrypted}`;
};

// Parse stored encrypted key
const parseStoredKey = (stored: string): { encrypted: string; iv: string; tag: string } => {
  const [iv, tag, encrypted] = stored.split(':');
  return { encrypted, iv, tag };
};

// Get key hint (last 4 characters)
const getKeyHint = (key: string): string => {
  if (key.length <= 4) return '****';
  return '...' + key.slice(-4);
};

// Validation middleware
const validateApiKey = [
  body('service')
    .trim()
    .notEmpty().withMessage('Service name is required')
    .isIn(['anthropic', 'openai', 'google', 'azure', 'custom'])
    .withMessage('Invalid service name'),

  body('apiKey')
    .trim()
    .notEmpty().withMessage('API key is required')
    .isLength({ min: 10, max: 500 }).withMessage('Invalid API key length'),
];

// Cookie options for httpOnly delivery
const getCookieOptions = (maxAge?: number): any => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: maxAge || 3600000, // 1 hour default
  path: '/',
});

/**
 * POST /api/keys
 * Store an encrypted API key
 */
router.post(
  '/',
  authenticateToken,
  validateApiKey,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { service, apiKey } = req.body;
      const userId = (req as any).user?.id || 'anonymous';

      // Encrypt the API key
      const { encrypted, iv, tag } = encrypt(apiKey);
      const storedKey = storeEncryptedKey(encrypted, iv, tag);
      const keyHint = getKeyHint(apiKey);

      if (db) {
        // Store in database
        await db.query(
          `INSERT INTO user_api_keys (user_id, service_name, encrypted_key, key_hint)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, service_name)
           DO UPDATE SET
             encrypted_key = $3,
             key_hint = $4,
             updated_at = CURRENT_TIMESTAMP,
             is_active = true`,
          [userId, service, storedKey, keyHint]
        );
      } else {
        // In-memory storage for development (not recommended for production)
        console.warn('⚠️ Using in-memory storage for API keys (database not configured)');
      }

      // Set the key in an httpOnly cookie
      const cookieName = `apiKey_${service}`;
      res.cookie(cookieName, storedKey, getCookieOptions());

      res.status(201).json({
        success: true,
        message: 'API key stored securely',
        data: {
          service,
          hint: keyHint,
          stored: true,
        },
      });
    } catch (error) {
      console.error('Failed to store API key:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to store API key',
      });
    }
  }
);

/**
 * GET /api/keys/:service
 * Retrieve an encrypted API key
 */
router.get(
  '/:service',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { service } = req.params;
      const userId = (req as any).user?.id || 'anonymous';

      // Valid services
      const validServices = ['anthropic', 'openai', 'google', 'azure', 'custom'];
      if (!validServices.includes(service)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid service name',
        });
      }

      if (db) {
        // Get from database
        const result = await db.query(
          `SELECT encrypted_key, key_hint, is_active
           FROM user_api_keys
           WHERE user_id = $1 AND service_name = $2 AND is_active = true`,
          [userId, service]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'API key not found',
          });
        }

        const { encrypted_key, key_hint } = result.rows[0];

        // Update last used timestamp
        await db.query(
          `UPDATE user_api_keys
           SET last_used_at = CURRENT_TIMESTAMP,
               usage_count = usage_count + 1
           WHERE user_id = $1 AND service_name = $2`,
          [userId, service]
        );

        // Set in httpOnly cookie
        const cookieName = `apiKey_${service}`;
        res.cookie(cookieName, encrypted_key, getCookieOptions());

        res.json({
          success: true,
          message: 'API key retrieved',
          data: {
            service,
            hint: key_hint,
            available: true,
          },
        });
      } else {
        // Check cookie for development
        const cookieName = `apiKey_${service}`;
        const storedKey = req.cookies?.[cookieName];

        if (!storedKey) {
          return res.status(404).json({
            success: false,
            message: 'API key not found',
          });
        }

        res.json({
          success: true,
          message: 'API key retrieved from cookie',
          data: {
            service,
            available: true,
          },
        });
      }
    } catch (error) {
      console.error('Failed to retrieve API key:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve API key',
      });
    }
  }
);

/**
 * DELETE /api/keys/:service
 * Delete an API key
 */
router.delete(
  '/:service',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { service } = req.params;
      const userId = (req as any).user?.id || 'anonymous';

      if (db) {
        // Soft delete in database
        const result = await db.query(
          `UPDATE user_api_keys
           SET is_active = false, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND service_name = $2 AND is_active = true
           RETURNING id`,
          [userId, service]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'API key not found',
          });
        }
      }

      // Clear the cookie
      const cookieName = `apiKey_${service}`;
      res.clearCookie(cookieName, { path: '/' });

      res.json({
        success: true,
        message: 'API key deleted',
        data: {
          service,
          deleted: true,
        },
      });
    } catch (error) {
      console.error('Failed to delete API key:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete API key',
      });
    }
  }
);

/**
 * GET /api/keys
 * List all stored API keys (without decryption)
 */
router.get(
  '/',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id || 'anonymous';

      if (db) {
        const result = await db.query(
          `SELECT service_name, key_hint, is_active, created_at, updated_at, last_used_at, usage_count
           FROM user_api_keys
           WHERE user_id = $1 AND is_active = true
           ORDER BY service_name`,
          [userId]
        );

        res.json({
          success: true,
          data: result.rows.map(row => ({
            service: row.service_name,
            hint: row.key_hint,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastUsedAt: row.last_used_at,
            usageCount: row.usage_count,
          })),
        });
      } else {
        // For development, check cookies
        const keys: any[] = [];
        const validServices = ['anthropic', 'openai', 'google', 'azure', 'custom'];

        for (const service of validServices) {
          const cookieName = `apiKey_${service}`;
          if (req.cookies?.[cookieName]) {
            keys.push({ service, available: true });
          }
        }

        res.json({
          success: true,
          data: keys,
        });
      }
    } catch (error) {
      console.error('Failed to list API keys:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list API keys',
      });
    }
  }
);

/**
 * POST /api/keys/decrypt
 * Decrypt an API key for internal use (requires special permissions)
 */
router.post(
  '/decrypt',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { service } = req.body;
      const userId = (req as any).user?.id || 'anonymous';

      // Check if user has permission to decrypt (e.g., for API calls)
      // This should be restricted to server-side operations only
      const hasPermission = (req as any).user?.role === 'admin' ||
                           req.headers['x-internal-request'] === 'true';

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to decrypt API key',
        });
      }

      if (db) {
        const result = await db.query(
          `SELECT encrypted_key
           FROM user_api_keys
           WHERE user_id = $1 AND service_name = $2 AND is_active = true`,
          [userId, service]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'API key not found',
          });
        }

        const storedKey = result.rows[0].encrypted_key;
        const { encrypted, iv, tag } = parseStoredKey(storedKey);
        const decryptedKey = decrypt(encrypted, iv, tag);

        // Never send decrypted key to frontend
        // This should only be used for server-side API calls
        res.json({
          success: true,
          message: 'API key decrypted for internal use',
          // key: decryptedKey // Uncomment only for server-to-server communication
        });
      } else {
        res.status(503).json({
          success: false,
          message: 'Database not available',
        });
      }
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to decrypt API key',
      });
    }
  }
);

/**
 * GET /api/keys/health
 * Health check endpoint
 */
router.get('/health/check', (req: Request, res: Response) => {
  const dbConfigured = db !== null;
  const encryptionConfigured = !!process.env.API_KEY_ENCRYPTION_SECRET;

  res.json({
    success: true,
    status: 'operational',
    features: {
      database: dbConfigured,
      encryption: encryptionConfigured,
    },
    security: {
      algorithm: ALGORITHM,
      keyDerivation: 'PBKDF2',
      iterations: ITERATIONS,
    },
    timestamp: new Date().toISOString(),
  });
});

// Cleanup on process termination
process.on('SIGTERM', async () => {
  if (db) {
    await db.end();
  }
});

// Export a helper function for internal API key retrieval
export const getDecryptedApiKey = async (userId: string, service: string): Promise<string | null> => {
  if (!db) return null;

  try {
    const result = await db.query(
      `SELECT encrypted_key
       FROM user_api_keys
       WHERE user_id = $1 AND service_name = $2 AND is_active = true`,
      [userId, service]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const storedKey = result.rows[0].encrypted_key;
    const { encrypted, iv, tag } = parseStoredKey(storedKey);
    return decrypt(encrypted, iv, tag);
  } catch (error) {
    console.error('Failed to get decrypted API key:', error);
    return null;
  }
};

export { router as apiKeyRoutes };