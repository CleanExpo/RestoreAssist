# Feature 4: Webhooks & API Integration

Complete implementation guide for Webhooks, API Keys, and External API endpoints for RestoreAssist Phase 2.

---

## Table of Contents

- [Part 1: Webhook System](#part-1-webhook-system)
  - [Database Schema](#webhook-database-schema)
  - [Webhook Service](#webhook-service)
  - [Webhook Delivery System](#webhook-delivery-system)
  - [API Routes](#webhook-api-routes)
  - [Frontend Components](#webhook-frontend-components)
- [Part 2: API Key Management](#part-2-api-key-management)
  - [Database Schema](#api-key-database-schema)
  - [API Key Service](#api-key-service)
  - [API Key Authentication](#api-key-authentication)
  - [External API Routes](#external-api-routes)
  - [Frontend Components](#api-key-frontend-components)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Part 1: Webhook System

### Webhook Database Schema

Create the database tables for webhooks and delivery tracking.

**File**: `packages/backend/src/db/migrations/011_webhooks_system.sql`

```sql
-- =====================================================
-- WEBHOOKS DATABASE SCHEMA
-- =====================================================

-- Webhook event types enum
CREATE TYPE webhook_event AS ENUM (
  'report.created',
  'report.updated',
  'report.deleted',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'user.invited',
  'user.joined',
  'export.completed',
  'integration.connected',
  'organization.updated',
  'member.added',
  'member.removed',
  'role.changed',
  'settings.updated'
);

-- Webhooks table
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  events webhook_event[] NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  headers JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT url_valid CHECK (url ~ '^https?://'),
  CONSTRAINT events_not_empty CHECK (array_length(events, 1) > 0)
);

-- Webhook deliveries table (delivery history and retry tracking)
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type webhook_event NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  response_status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_webhooks_organization_id ON webhooks(organization_id);
CREATE INDEX idx_webhooks_is_active ON webhooks(is_active);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN (events);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp on webhook modification
CREATE OR REPLACE FUNCTION update_webhook_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhooks_update_timestamp
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_timestamp();

CREATE TRIGGER webhook_deliveries_update_timestamp
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_timestamp();

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View for webhook statistics
CREATE OR REPLACE VIEW webhook_stats AS
SELECT
  w.id as webhook_id,
  w.name,
  w.organization_id,
  COUNT(wd.id) as total_deliveries,
  COUNT(wd.id) FILTER (WHERE wd.status = 'success') as successful_deliveries,
  COUNT(wd.id) FILTER (WHERE wd.status = 'failed') as failed_deliveries,
  COUNT(wd.id) FILTER (WHERE wd.status = 'retrying') as retrying_deliveries,
  MAX(wd.created_at) as last_delivery_at,
  ROUND(
    (COUNT(wd.id) FILTER (WHERE wd.status = 'success')::NUMERIC /
     NULLIF(COUNT(wd.id), 0) * 100),
    2
  ) as success_rate
FROM webhooks w
LEFT JOIN webhook_deliveries wd ON w.id = wd.webhook_id
GROUP BY w.id, w.name, w.organization_id;

-- =====================================================
-- CLEANUP FUNCTION
-- =====================================================

-- Function to delete old webhook deliveries (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_deliveries()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_deliveries
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND status IN ('success', 'failed');
END;
$$ LANGUAGE plpgsql;
```

---

### Webhook Service

**File**: `packages/backend/src/services/webhook.service.ts`

```typescript
import { Pool } from 'pg';
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { Logger } from '../utils/logger';
import { z } from 'zod';

// =====================================================
// TYPES & SCHEMAS
// =====================================================

export type WebhookEvent =
  | 'report.created'
  | 'report.updated'
  | 'report.deleted'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'user.invited'
  | 'user.joined'
  | 'export.completed'
  | 'integration.connected'
  | 'organization.updated'
  | 'member.added'
  | 'member.removed'
  | 'role.changed'
  | 'settings.updated';

export interface Webhook {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  isActive: boolean;
  description: string | null;
  headers: Record<string, string>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt: Date | null;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: WebhookEvent;
  payload: Record<string, any>;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  responseStatusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookDTO {
  organizationId: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  description?: string;
  headers?: Record<string, string>;
  createdBy: string;
}

export interface UpdateWebhookDTO {
  name?: string;
  url?: string;
  events?: WebhookEvent[];
  isActive?: boolean;
  description?: string;
  headers?: Record<string, string>;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  organizationId: string;
  data: Record<string, any>;
}

const createWebhookSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  url: z.string().url().regex(/^https?:\/\//),
  events: z.array(z.string()).min(1),
  description: z.string().max(1000).optional(),
  headers: z.record(z.string()).optional(),
  createdBy: z.string().uuid(),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().regex(/^https?:\/\//).optional(),
  events: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(1000).optional(),
  headers: z.record(z.string()).optional(),
});

// =====================================================
// WEBHOOK SERVICE
// =====================================================

export class WebhookService {
  private logger: Logger;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [60, 300, 900]; // 1min, 5min, 15min in seconds

  constructor(private db: Pool) {
    this.logger = new Logger('WebhookService');
  }

  // =====================================================
  // WEBHOOK CRUD
  // =====================================================

  async createWebhook(data: CreateWebhookDTO): Promise<Webhook> {
    const validated = createWebhookSchema.parse(data);

    try {
      // Generate webhook secret (for HMAC signature)
      const secret = this.generateSecret();

      const result = await this.db.query(
        `INSERT INTO webhooks
         (organization_id, name, url, secret, events, description, headers, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          validated.organizationId,
          validated.name,
          validated.url,
          secret,
          validated.events,
          validated.description || null,
          JSON.stringify(validated.headers || {}),
          validated.createdBy,
        ]
      );

      const webhook = this.mapWebhook(result.rows[0]);

      this.logger.info('Webhook created', {
        webhookId: webhook.id,
        organizationId: webhook.organizationId,
        url: webhook.url,
      });

      return webhook;
    } catch (error) {
      this.logger.error('Error creating webhook', error);
      throw error;
    }
  }

  async getWebhooks(
    organizationId: string,
    options: {
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ webhooks: Webhook[]; total: number }> {
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
        SELECT * FROM webhooks
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await this.db.query(query, params);

      const countQuery = `SELECT COUNT(*) as total FROM webhooks WHERE ${whereClause}`;
      const countResult = await this.db.query(countQuery, params.slice(0, -2));

      const webhooks = result.rows.map((row) => this.mapWebhook(row));

      return {
        webhooks,
        total: parseInt(countResult.rows[0].total, 10),
      };
    } catch (error) {
      this.logger.error('Error getting webhooks', error);
      throw error;
    }
  }

  async getWebhookById(webhookId: string): Promise<Webhook> {
    try {
      const result = await this.db.query('SELECT * FROM webhooks WHERE id = $1', [
        webhookId,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Webhook not found');
      }

      return this.mapWebhook(result.rows[0]);
    } catch (error) {
      this.logger.error('Error getting webhook by ID', error);
      throw error;
    }
  }

  async updateWebhook(
    webhookId: string,
    data: UpdateWebhookDTO
  ): Promise<Webhook> {
    const validated = updateWebhookSchema.parse(data);

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (validated.name) {
        updates.push(`name = $${paramIndex}`);
        values.push(validated.name);
        paramIndex++;
      }

      if (validated.url) {
        updates.push(`url = $${paramIndex}`);
        values.push(validated.url);
        paramIndex++;
      }

      if (validated.events) {
        updates.push(`events = $${paramIndex}`);
        values.push(validated.events);
        paramIndex++;
      }

      if (validated.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        values.push(validated.isActive);
        paramIndex++;
      }

      if (validated.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        values.push(validated.description);
        paramIndex++;
      }

      if (validated.headers) {
        updates.push(`headers = $${paramIndex}`);
        values.push(JSON.stringify(validated.headers));
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new Error('No updates provided');
      }

      values.push(webhookId);

      const query = `
        UPDATE webhooks
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Webhook not found');
      }

      this.logger.info('Webhook updated', { webhookId });

      return this.mapWebhook(result.rows[0]);
    } catch (error) {
      this.logger.error('Error updating webhook', error);
      throw error;
    }
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      const result = await this.db.query('DELETE FROM webhooks WHERE id = $1', [
        webhookId,
      ]);

      if (result.rowCount === 0) {
        throw new Error('Webhook not found');
      }

      this.logger.info('Webhook deleted', { webhookId });
    } catch (error) {
      this.logger.error('Error deleting webhook', error);
      throw error;
    }
  }

  // =====================================================
  // WEBHOOK TRIGGERING
  // =====================================================

  async triggerWebhook(
    organizationId: string,
    event: WebhookEvent,
    data: Record<string, any>
  ): Promise<void> {
    try {
      // Find all active webhooks for this organization that listen to this event
      const result = await this.db.query(
        `SELECT * FROM webhooks
         WHERE organization_id = $1
           AND is_active = TRUE
           AND $2 = ANY(events)`,
        [organizationId, event]
      );

      const webhooks = result.rows.map((row) => this.mapWebhook(row));

      // Trigger each webhook
      for (const webhook of webhooks) {
        await this.deliverWebhook(webhook, event, data);
      }

      this.logger.info('Webhooks triggered', {
        organizationId,
        event,
        count: webhooks.length,
      });
    } catch (error) {
      this.logger.error('Error triggering webhooks', error);
      // Don't throw - webhook failures shouldn't block the main operation
    }
  }

  private async deliverWebhook(
    webhook: Webhook,
    event: WebhookEvent,
    data: Record<string, any>
  ): Promise<void> {
    try {
      // Create payload
      const payload: WebhookPayload = {
        id: crypto.randomUUID(),
        event,
        timestamp: new Date().toISOString(),
        organizationId: webhook.organizationId,
        data,
      };

      // Create delivery record
      const deliveryResult = await this.db.query(
        `INSERT INTO webhook_deliveries
         (webhook_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [webhook.id, event, JSON.stringify(payload), 'pending']
      );

      const deliveryId = deliveryResult.rows[0].id;

      // Deliver asynchronously (don't wait)
      this.executeDelivery(webhook, payload, deliveryId).catch((error) => {
        this.logger.error('Error executing webhook delivery', error);
      });

      // Update last triggered timestamp
      await this.db.query(
        'UPDATE webhooks SET last_triggered_at = NOW() WHERE id = $1',
        [webhook.id]
      );
    } catch (error) {
      this.logger.error('Error delivering webhook', error);
      throw error;
    }
  }

  private async executeDelivery(
    webhook: Webhook,
    payload: WebhookPayload,
    deliveryId: string,
    attemptCount: number = 0
  ): Promise<void> {
    try {
      // Generate HMAC signature
      const signature = this.generateSignature(webhook.secret, payload);

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-ID': payload.id,
        'User-Agent': 'RestoreAssist-Webhooks/1.0',
        ...webhook.headers,
      };

      // Send webhook request
      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: 10000, // 10 second timeout
        validateStatus: () => true, // Don't throw on any status code
      });

      // Update delivery record based on response
      if (response.status >= 200 && response.status < 300) {
        // Success
        await this.db.query(
          `UPDATE webhook_deliveries
           SET status = 'success',
               response_status_code = $1,
               response_body = $2,
               attempt_count = $3,
               delivered_at = NOW()
           WHERE id = $4`,
          [
            response.status,
            JSON.stringify(response.data).substring(0, 10000), // Limit response body size
            attemptCount + 1,
            deliveryId,
          ]
        );

        this.logger.info('Webhook delivered successfully', {
          deliveryId,
          webhookId: webhook.id,
          statusCode: response.status,
        });
      } else {
        // Failed - schedule retry if within max attempts
        await this.handleDeliveryFailure(
          deliveryId,
          webhook,
          payload,
          attemptCount + 1,
          response.status,
          response.data
        );
      }
    } catch (error) {
      // Network error or timeout - schedule retry
      const errorMessage = error instanceof AxiosError
        ? error.message
        : 'Unknown error';

      await this.handleDeliveryFailure(
        deliveryId,
        webhook,
        payload,
        attemptCount + 1,
        null,
        null,
        errorMessage
      );
    }
  }

  private async handleDeliveryFailure(
    deliveryId: string,
    webhook: Webhook,
    payload: WebhookPayload,
    attemptCount: number,
    statusCode: number | null,
    responseBody: any,
    errorMessage?: string
  ): Promise<void> {
    if (attemptCount >= this.MAX_RETRY_ATTEMPTS) {
      // Max attempts reached - mark as failed
      await this.db.query(
        `UPDATE webhook_deliveries
         SET status = 'failed',
             response_status_code = $1,
             response_body = $2,
             error_message = $3,
             attempt_count = $4
         WHERE id = $5`,
        [
          statusCode,
          responseBody ? JSON.stringify(responseBody).substring(0, 10000) : null,
          errorMessage || `HTTP ${statusCode}`,
          attemptCount,
          deliveryId,
        ]
      );

      this.logger.warn('Webhook delivery failed after max attempts', {
        deliveryId,
        webhookId: webhook.id,
        attemptCount,
      });
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = this.RETRY_DELAYS[attemptCount - 1] || 900; // Default to 15min
      const nextRetryAt = new Date(Date.now() + retryDelay * 1000);

      await this.db.query(
        `UPDATE webhook_deliveries
         SET status = 'retrying',
             response_status_code = $1,
             response_body = $2,
             error_message = $3,
             attempt_count = $4,
             next_retry_at = $5
         WHERE id = $6`,
        [
          statusCode,
          responseBody ? JSON.stringify(responseBody).substring(0, 10000) : null,
          errorMessage || `HTTP ${statusCode}`,
          attemptCount,
          nextRetryAt,
          deliveryId,
        ]
      );

      this.logger.info('Webhook delivery scheduled for retry', {
        deliveryId,
        webhookId: webhook.id,
        attemptCount,
        nextRetryAt,
      });

      // Schedule retry
      setTimeout(() => {
        this.executeDelivery(webhook, payload, deliveryId, attemptCount).catch(
          (error) => {
            this.logger.error('Error in webhook retry', error);
          }
        );
      }, retryDelay * 1000);
    }
  }

  // =====================================================
  // WEBHOOK TESTING
  // =====================================================

  async testWebhook(webhookId: string): Promise<WebhookDelivery> {
    try {
      const webhook = await this.getWebhookById(webhookId);

      const testPayload: WebhookPayload = {
        id: crypto.randomUUID(),
        event: 'report.created', // Use a test event
        timestamp: new Date().toISOString(),
        organizationId: webhook.organizationId,
        data: {
          test: true,
          message: 'This is a test webhook delivery from RestoreAssist',
        },
      };

      // Create delivery record
      const deliveryResult = await this.db.query(
        `INSERT INTO webhook_deliveries
         (webhook_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [webhook.id, 'report.created', JSON.stringify(testPayload), 'pending']
      );

      const deliveryId = deliveryResult.rows[0].id;

      // Execute delivery synchronously for testing
      await this.executeDelivery(webhook, testPayload, deliveryId);

      // Fetch updated delivery record
      const updatedDelivery = await this.db.query(
        'SELECT * FROM webhook_deliveries WHERE id = $1',
        [deliveryId]
      );

      return this.mapWebhookDelivery(updatedDelivery.rows[0]);
    } catch (error) {
      this.logger.error('Error testing webhook', error);
      throw error;
    }
  }

  // =====================================================
  // WEBHOOK DELIVERIES
  // =====================================================

  async getWebhookDeliveries(
    webhookId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const { status, limit = 50, offset = 0 } = options;

    try {
      const conditions: string[] = ['webhook_id = $1'];
      const params: any[] = [webhookId];
      let paramIndex = 2;

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const query = `
        SELECT * FROM webhook_deliveries
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await this.db.query(query, params);

      const countQuery = `SELECT COUNT(*) as total FROM webhook_deliveries WHERE ${whereClause}`;
      const countResult = await this.db.query(countQuery, params.slice(0, -2));

      const deliveries = result.rows.map((row) => this.mapWebhookDelivery(row));

      return {
        deliveries,
        total: parseInt(countResult.rows[0].total, 10),
      };
    } catch (error) {
      this.logger.error('Error getting webhook deliveries', error);
      throw error;
    }
  }

  async getWebhookStats(webhookId: string): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    retryingDeliveries: number;
    successRate: number;
    lastDeliveryAt: Date | null;
  }> {
    try {
      const result = await this.db.query(
        'SELECT * FROM webhook_stats WHERE webhook_id = $1',
        [webhookId]
      );

      if (result.rows.length === 0) {
        return {
          totalDeliveries: 0,
          successfulDeliveries: 0,
          failedDeliveries: 0,
          retryingDeliveries: 0,
          successRate: 0,
          lastDeliveryAt: null,
        };
      }

      const stats = result.rows[0];

      return {
        totalDeliveries: parseInt(stats.total_deliveries, 10),
        successfulDeliveries: parseInt(stats.successful_deliveries, 10),
        failedDeliveries: parseInt(stats.failed_deliveries, 10),
        retryingDeliveries: parseInt(stats.retrying_deliveries, 10),
        successRate: parseFloat(stats.success_rate || '0'),
        lastDeliveryAt: stats.last_delivery_at,
      };
    } catch (error) {
      this.logger.error('Error getting webhook stats', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateSignature(secret: string, payload: any): string {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  private mapWebhook(row: any): Webhook {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      url: row.url,
      secret: row.secret,
      events: row.events,
      isActive: row.is_active,
      description: row.description,
      headers: row.headers || {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTriggeredAt: row.last_triggered_at,
    };
  }

  private mapWebhookDelivery(row: any): WebhookDelivery {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      eventType: row.event_type,
      payload: row.payload || {},
      status: row.status,
      responseStatusCode: row.response_status_code,
      responseBody: row.response_body,
      errorMessage: row.error_message,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      nextRetryAt: row.next_retry_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

The file is getting very long. Let me continue in the next message with the Webhook API routes and remaining sections...

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[
  {
    "content": "Complete Feature 3 Part 4: Comments & @Mentions System",
    "status": "completed",
    "activeForm": "Completing Feature 3 Part 4: Comments & @Mentions System"
  },
  {
    "content": "Complete Feature 3 Part 5: Activity Feed & Notifications",
    "status": "completed",
    "activeForm": "Completing Feature 3 Part 5: Activity Feed & Notifications"
  },
  {
    "content": "Complete Feature 4 Part 1: Webhooks System",
    "status": "in_progress",
    "activeForm": "Completing Feature 4 Part 1: Webhooks System"
  },
  {
    "content": "Complete Feature 4 Part 2: API Key Management",
    "status": "pending",
    "activeForm": "Completing Feature 4 Part 2: API Key Management"
  },
  {
    "content": "Create comprehensive documentation and testing examples",
    "status": "pending",
    "activeForm": "Creating comprehensive documentation and testing examples"
  }
]