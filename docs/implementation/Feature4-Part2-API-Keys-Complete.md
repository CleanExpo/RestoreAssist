# Feature 4 Part 2: API Key Management System

Complete implementation for API Key generation, authentication, rate limiting, and external API endpoints.

---

## Table of Contents

- [API Key Database Schema](#api-key-database-schema)
- [API Key Service](#api-key-service)
- [API Key Authentication Middleware](#api-key-authentication-middleware)
- [API Key Management Routes](#api-key-management-routes)
- [Rate Limiting System](#rate-limiting-system)
- [External API Endpoints](#external-api-endpoints)
- [Frontend Components](#frontend-components)
- [Testing](#testing)

---

## API Key Database Schema

**File**: `packages/backend/src/db/migrations/012_api_keys_system.sql`

```sql
-- =====================================================
-- API KEYS DATABASE SCHEMA
-- =====================================================

-- API Keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(15) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT key_prefix_unique UNIQUE (key_prefix),
  CONSTRAINT permissions_not_empty CHECK (array_length(permissions, 1) > 0)
);

-- API Key usage logs table
CREATE TABLE api_key_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  ip_address INET,
  user_agent TEXT,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX idx_api_keys_created_by ON api_keys(created_by);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_api_key_logs_api_key_id ON api_key_logs(api_key_id);
CREATE INDEX idx_api_key_logs_created_at ON api_key_logs(created_at DESC);
CREATE INDEX idx_api_key_logs_endpoint ON api_key_logs(endpoint);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_key_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_keys_update_timestamp
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_key_timestamp();

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View for API key usage statistics
CREATE OR REPLACE VIEW api_key_usage_stats AS
SELECT
  ak.id as api_key_id,
  ak.name,
  ak.organization_id,
  COUNT(akl.id) as total_requests,
  COUNT(akl.id) FILTER (WHERE akl.status_code >= 200 AND akl.status_code < 300) as successful_requests,
  COUNT(akl.id) FILTER (WHERE akl.status_code >= 400) as failed_requests,
  AVG(akl.response_time_ms) as avg_response_time_ms,
  MAX(akl.created_at) as last_used_at
FROM api_keys ak
LEFT JOIN api_key_logs akl ON ak.id = akl.api_key_id
GROUP BY ak.id, ak.name, ak.organization_id;

-- =====================================================
-- CLEANUP FUNCTION
-- =====================================================

-- Function to delete old API key logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_api_key_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM api_key_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Function to deactivate expired API keys
CREATE OR REPLACE FUNCTION deactivate_expired_api_keys()
RETURNS void AS $$
BEGIN
  UPDATE api_keys
  SET is_active = FALSE
  WHERE expires_at < NOW() AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## API Key Service

**File**: `packages/backend/src/services/apiKey.service.ts`

```typescript
import { Pool } from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Logger } from '../utils/logger';

// =====================================================
// TYPES & SCHEMAS
// =====================================================

export type ApiKeyPermission =
  | 'reports.read'
  | 'reports.write'
  | 'reports.delete'
  | 'analytics.read'
  | 'comments.read'
  | 'comments.write'
  | 'webhooks.read'
  | 'webhooks.write'
  | 'users.read'
  | 'organizations.read'
  | '*'; // Wildcard for all permissions

export interface ApiKey {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  keyPrefix: string;
  permissions: ApiKeyPermission[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string; // Only returned on creation
}

export interface CreateApiKeyDTO {
  organizationId: string;
  createdBy: string;
  name: string;
  permissions: ApiKeyPermission[];
  expiresAt?: Date;
}

export interface UpdateApiKeyDTO {
  name?: string;
  permissions?: ApiKeyPermission[];
  isActive?: boolean;
  expiresAt?: Date;
}

export interface ApiKeyValidation {
  isValid: boolean;
  apiKeyId?: string;
  organizationId?: string;
  permissions?: ApiKeyPermission[];
  isExpired?: boolean;
}

export interface ApiKeyUsageLog {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

const createApiKeySchema = z.object({
  organizationId: z.string().uuid(),
  createdBy: z.string().uuid(),
  name: z.string().min(1).max(255),
  permissions: z.array(z.string()).min(1),
  expiresAt: z.date().optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.date().optional(),
});

// =====================================================
// API KEY SERVICE
// =====================================================

export class ApiKeyService {
  private logger: Logger;
  private readonly SALT_ROUNDS = 12;
  private readonly KEY_PREFIX = 'resto_';
  private readonly KEY_LENGTH = 32; // bytes (64 hex chars)

  constructor(private db: Pool) {
    this.logger = new Logger('ApiKeyService');
  }

  // =====================================================
  // CREATE API KEY
  // =====================================================

  async createApiKey(data: CreateApiKeyDTO): Promise<ApiKeyWithSecret> {
    const validated = createApiKeySchema.parse(data);

    try {
      // Generate API key
      const keySecret = this.generateKeySecret();
      const key = `${this.KEY_PREFIX}${keySecret}`;
      const keyPrefix = key.substring(0, 15); // First 15 chars for lookup
      const keyHash = await bcrypt.hash(key, this.SALT_ROUNDS);

      // Store key
      const result = await this.db.query(
        `INSERT INTO api_keys
         (organization_id, created_by, name, key_prefix, key_hash, permissions, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          validated.organizationId,
          validated.createdBy,
          validated.name,
          keyPrefix,
          keyHash,
          validated.permissions,
          validated.expiresAt || null,
        ]
      );

      const apiKey = this.mapApiKey(result.rows[0]);

      this.logger.info('API key created', {
        apiKeyId: apiKey.id,
        organizationId: apiKey.organizationId,
        name: apiKey.name,
      });

      return {
        ...apiKey,
        key, // Return plaintext key ONLY on creation
      };
    } catch (error) {
      this.logger.error('Error creating API key', error);
      throw error;
    }
  }

  // =====================================================
  // VALIDATE API KEY
  // =====================================================

  async validateApiKey(key: string): Promise<ApiKeyValidation> {
    try {
      // Extract prefix
      if (!key.startsWith(this.KEY_PREFIX)) {
        return { isValid: false };
      }

      const keyPrefix = key.substring(0, 15);

      // Look up key by prefix
      const result = await this.db.query(
        `SELECT * FROM api_keys
         WHERE key_prefix = $1 AND is_active = TRUE`,
        [keyPrefix]
      );

      if (result.rows.length === 0) {
        return { isValid: false };
      }

      const apiKey = this.mapApiKey(result.rows[0]);

      // Compare hash
      const isValid = await bcrypt.compare(key, result.rows[0].key_hash);

      if (!isValid) {
        return { isValid: false };
      }

      // Check expiration
      const isExpired = apiKey.expiresAt && apiKey.expiresAt < new Date();

      if (isExpired) {
        return {
          isValid: false,
          isExpired: true,
        };
      }

      // Update last used timestamp
      await this.db.query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
        [apiKey.id]
      );

      return {
        isValid: true,
        apiKeyId: apiKey.id,
        organizationId: apiKey.organizationId,
        permissions: apiKey.permissions,
      };
    } catch (error) {
      this.logger.error('Error validating API key', error);
      return { isValid: false };
    }
  }

  // =====================================================
  // GET API KEYS
  // =====================================================

  async getApiKeys(
    organizationId: string,
    options: {
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ apiKeys: ApiKey[]; total: number }> {
    const { isActive, limit = 50, offset = 0 } = options;

    try {
      const conditions: string[] = ['organization_id = $1'];
      const params: any[] = [organizationId];
      let paramIndex = 2;

      if (isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(isActive);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const query = `
        SELECT * FROM api_keys
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await this.db.query(query, params);

      const countQuery = `SELECT COUNT(*) as total FROM api_keys WHERE ${whereClause}`;
      const countResult = await this.db.query(countQuery, params.slice(0, -2));

      const apiKeys = result.rows.map((row) => this.mapApiKey(row));

      return {
        apiKeys,
        total: parseInt(countResult.rows[0].total, 10),
      };
    } catch (error) {
      this.logger.error('Error getting API keys', error);
      throw error;
    }
  }

  async getApiKeyById(apiKeyId: string): Promise<ApiKey> {
    try {
      const result = await this.db.query('SELECT * FROM api_keys WHERE id = $1', [
        apiKeyId,
      ]);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      return this.mapApiKey(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting API key by ID', error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE API KEY
  // =====================================================

  async updateApiKey(
    apiKeyId: string,
    data: UpdateApiKeyDTO
  ): Promise<ApiKey> {
    const validated = updateApiKeySchema.parse(data);

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (validated.name) {
        updates.push(`name = $${paramIndex}`);
        values.push(validated.name);
        paramIndex++;
      }

      if (validated.permissions) {
        updates.push(`permissions = $${paramIndex}`);
        values.push(validated.permissions);
        paramIndex++;
      }

      if (validated.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        values.push(validated.isActive);
        paramIndex++;
      }

      if (validated.expiresAt !== undefined) {
        updates.push(`expires_at = $${paramIndex}`);
        values.push(validated.expiresAt);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new Error('No updates provided');
      }

      values.push(apiKeyId);

      const query = `
        UPDATE api_keys
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      this.logger.info('API key updated', { apiKeyId });

      return this.mapApiKey(result.rows[0]);
    } catch (error) {
      this.logger.error('Error updating API key', error);
      throw error;
    }
  }

  // =====================================================
  // DELETE/REVOKE API KEY
  // =====================================================

  async deleteApiKey(apiKeyId: string): Promise<void> {
    try {
      const result = await this.db.query('DELETE FROM api_keys WHERE id = $1', [
        apiKeyId,
      ]);

      if (result.rowCount === 0) {
        throw new Error('API key not found');
      }

      this.logger.info('API key deleted', { apiKeyId });
    } catch (error) {
      this.logger.error('Error deleting API key', error);
      throw error;
    }
  }

  async revokeApiKey(apiKeyId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'UPDATE api_keys SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
        [apiKeyId]
      );

      if (result.rowCount === 0) {
        throw new Error('API key not found');
      }

      this.logger.info('API key revoked', { apiKeyId });
    } catch (error) {
      this.logger.error('Error revoking API key', error);
      throw error;
    }
  }

  // =====================================================
  // ROTATE API KEY
  // =====================================================

  async rotateApiKey(
    apiKeyId: string,
    organizationId: string
  ): Promise<ApiKeyWithSecret> {
    try {
      // Get existing key details
      const existing = await this.getApiKeyById(apiKeyId);

      // Verify organization ownership
      if (existing.organizationId !== organizationId) {
        throw new Error('Access denied');
      }

      // Delete old key
      await this.deleteApiKey(apiKeyId);

      // Create new key with same name and permissions
      const newKey = await this.createApiKey({
        organizationId: existing.organizationId,
        createdBy: existing.createdBy,
        name: `${existing.name} (Rotated)`,
        permissions: existing.permissions,
        expiresAt: existing.expiresAt || undefined,
      });

      this.logger.info('API key rotated', {
        oldKeyId: apiKeyId,
        newKeyId: newKey.id,
      });

      return newKey;
    } catch (error) {
      this.logger.error('Error rotating API key', error);
      throw error;
    }
  }

  // =====================================================
  // PERMISSION CHECKS
  // =====================================================

  checkPermission(
    userPermissions: ApiKeyPermission[],
    requiredPermission: string
  ): boolean {
    // Check for wildcard
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check exact permission
    if (userPermissions.includes(requiredPermission as ApiKeyPermission)) {
      return true;
    }

    // Check for resource wildcard (e.g., reports.* matches reports.read)
    const resourceWildcard = requiredPermission.split('.')[0] + '.*';
    if (userPermissions.includes(resourceWildcard as ApiKeyPermission)) {
      return true;
    }

    return false;
  }

  // =====================================================
  // USAGE LOGGING
  // =====================================================

  async logApiKeyUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number | null,
    ipAddress?: string,
    userAgent?: string,
    responseTimeMs?: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO api_key_logs
         (api_key_id, endpoint, method, status_code, ip_address, user_agent, response_time_ms, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          apiKeyId,
          endpoint,
          method,
          statusCode,
          ipAddress || null,
          userAgent || null,
          responseTimeMs || null,
          errorMessage || null,
        ]
      );
    } catch (error) {
      // Don't throw - logging failures shouldn't block requests
      this.logger.error('Error logging API key usage', error);
    }
  }

  async getApiKeyUsageLogs(
    apiKeyId: string,
    options: {
      limit?: number;
      offset?: number;
      days?: number;
    } = {}
  ): Promise<{ logs: ApiKeyUsageLog[]; total: number }> {
    const { limit = 100, offset = 0, days = 7 } = options;

    try {
      const query = `
        SELECT * FROM api_key_logs
        WHERE api_key_id = $1
          AND created_at > NOW() - INTERVAL '${days} days'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [apiKeyId, limit, offset]);

      const countQuery = `
        SELECT COUNT(*) as total FROM api_key_logs
        WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
      `;
      const countResult = await this.db.query(countQuery, [apiKeyId]);

      const logs = result.rows.map((row) => this.mapApiKeyUsageLog(row));

      return {
        logs,
        total: parseInt(countResult.rows[0].total, 10),
      };
    } catch (error) {
      this.logger.error('Error getting API key usage logs', error);
      throw error;
    }
  }

  async getApiKeyUsageStats(apiKeyId: string): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTimeMs: number;
    lastUsedAt: Date | null;
  }> {
    try {
      const result = await this.db.query(
        'SELECT * FROM api_key_usage_stats WHERE api_key_id = $1',
        [apiKeyId]
      );

      if (result.rows.length === 0) {
        return {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          avgResponseTimeMs: 0,
          lastUsedAt: null,
        };
      }

      const stats = result.rows[0];

      return {
        totalRequests: parseInt(stats.total_requests, 10),
        successfulRequests: parseInt(stats.successful_requests, 10),
        failedRequests: parseInt(stats.failed_requests, 10),
        avgResponseTimeMs: parseFloat(stats.avg_response_time_ms || '0'),
        lastUsedAt: stats.last_used_at,
      };
    } catch (error) {
      this.logger.error('Error getting API key usage stats', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private generateKeySecret(): string {
    return crypto.randomBytes(this.KEY_LENGTH).toString('hex');
  }

  private mapApiKey(row: any): ApiKey {
    return {
      id: row.id,
      organizationId: row.organization_id,
      createdBy: row.created_by,
      name: row.name,
      keyPrefix: row.key_prefix,
      permissions: row.permissions,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapApiKeyUsageLog(row: any): ApiKeyUsageLog {
    return {
      id: row.id,
      apiKeyId: row.api_key_id,
      endpoint: row.endpoint,
      method: row.method,
      statusCode: row.status_code,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      responseTimeMs: row.response_time_ms,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }
}
```

Due to length, I'll continue this implementation in a follow-up response with the middleware, routes, rate limiting, and frontend components. The file is getting quite comprehensive!

Would you like me to continue with the remaining sections (API Key Authentication Middleware, Management Routes, Rate Limiting, External API Endpoints, and Frontend Components)?