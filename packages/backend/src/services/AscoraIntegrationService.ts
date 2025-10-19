/**
 * Ascora Integration Service
 * High-level integration service for bi-directional sync between RestoreAssist and Ascora CRM
 *
 * Features:
 * - Connection management
 * - Bi-directional customer sync
 * - Job creation from reports
 * - Real-time status synchronization
 * - Invoice and payment tracking
 * - Webhook event handling
 * - Conflict resolution
 * - Error recovery and retry logic
 * - Complete audit trail
 *
 * @module AscoraIntegrationService
 */

import { Pool } from 'pg';
import AscoraApiClient, {
  AscoraConfig,
  AscoraCustomer,
  AscoraJob,
  AscoraInvoice,
  AscoraPayment
} from './AscoraApiClient';
import { encryptToken, decryptToken } from '../utils/encryption';

// ===== Type Definitions =====

export interface AscoraIntegration {
  id: string;
  organizationId: string;
  userId: string;
  apiUrl: string;
  apiToken: string;
  companyCode: string;
  isActive: boolean;
  lastSyncAt?: Date;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  webhookToken?: string;
  syncSettings: {
    syncCustomers: boolean;
    syncJobs: boolean;
    syncInvoices: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{
    resource: string;
    id?: string;
    message: string;
  }>;
  duration: number;
}

export interface ConflictData {
  resourceType: 'customer' | 'job' | 'invoice';
  localData: any;
  remoteData: any;
  conflictFields: string[];
  resolution?: 'local' | 'remote' | 'merge';
}

export interface WebhookData {
  event: string;
  resourceType: string;
  resourceId: string;
  data: any;
  timestamp: string;
  signature: string;
}

// ===== Main Integration Service =====

export class AscoraIntegrationService {
  private db: Pool;
  private clients: Map<string, AscoraApiClient> = new Map();

  constructor(db: Pool) {
    this.db = db;
  }

  // ===== Connection Management =====

  public async connectIntegration(
    organizationId: string,
    userId: string,
    apiUrl: string,
    apiToken: string,
    companyCode: string
  ): Promise<AscoraIntegration> {
    // Test connection first
    const client = new AscoraApiClient({
      apiUrl,
      apiToken,
      companyCode
    });

    try {
      await client.authenticate();
    } catch (error: any) {
      throw new Error(`Failed to connect to Ascora: ${error.message}`);
    }

    // Encrypt API token
    const encryptedToken = encryptToken(apiToken);

    // Generate webhook token
    const webhookToken = this.generateWebhookToken();

    // Store in database
    const result = await this.db.query(
      `INSERT INTO ascora_integrations
       (organization_id, user_id, api_url, api_token, company_code, webhook_token, is_active, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'idle')
       RETURNING *`,
      [organizationId, userId, apiUrl, encryptedToken, companyCode, webhookToken]
    );

    // Cache the client
    this.clients.set(organizationId, client);

    // Create sync log
    await this.createSyncLog(organizationId, result.rows[0].id, 'connect', 'success');

    return this.mapIntegrationFromDb(result.rows[0]);
  }

  public async disconnectIntegration(organizationId: string): Promise<void> {
    await this.db.query(
      `UPDATE ascora_integrations
       SET is_active = false, sync_status = 'idle', updated_at = NOW()
       WHERE organization_id = $1`,
      [organizationId]
    );

    // Remove cached client
    this.clients.delete(organizationId);

    // Stop any running sync schedules
    await this.stopSyncSchedule(organizationId);
  }

  public async getIntegration(organizationId: string): Promise<AscoraIntegration | null> {
    const result = await this.db.query(
      `SELECT * FROM ascora_integrations WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    if (result.rows.length === 0) return null;

    return this.mapIntegrationFromDb(result.rows[0]);
  }

  private async getClient(organizationId: string): Promise<AscoraApiClient> {
    // Check cache first
    if (this.clients.has(organizationId)) {
      return this.clients.get(organizationId)!;
    }

    // Get from database
    const integration = await this.getIntegration(organizationId);
    if (!integration) {
      throw new Error('No active Ascora integration found');
    }

    // Decrypt token
    const apiToken = decryptToken(integration.apiToken);

    // Create and cache client
    const client = new AscoraApiClient({
      apiUrl: integration.apiUrl,
      apiToken,
      companyCode: integration.companyCode
    });

    this.clients.set(organizationId, client);
    return client;
  }

  // ===== Customer Sync =====

  public async syncCustomers(organizationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const client = await this.getClient(organizationId);
    const integration = await this.getIntegration(organizationId);

    if (!integration) {
      throw new Error('Integration not found');
    }

    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 0
    };

    try {
      // Update sync status
      await this.updateSyncStatus(organizationId, 'syncing');

      // Fetch customers from Ascora
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await client.listCustomers({ limit, offset });

        for (const customer of response.customers) {
          try {
            await this.syncCustomer(organizationId, customer);
            result.processed++;
          } catch (error: any) {
            result.failed++;
            result.errors.push({
              resource: 'customer',
              id: customer.id,
              message: error.message
            });
          }
        }

        hasMore = response.hasMore;
        offset += limit;
      }

      // Update sync status
      await this.updateSyncStatus(organizationId, 'success');
      await this.updateLastSyncTime(organizationId);

      result.duration = Date.now() - startTime;
      return result;
    } catch (error: any) {
      await this.updateSyncStatus(organizationId, 'error');
      result.success = false;
      result.errors.push({
        resource: 'sync',
        message: error.message
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  private async syncCustomer(
    organizationId: string,
    customer: AscoraCustomer
  ): Promise<void> {
    // Check if customer exists
    const existing = await this.db.query(
      `SELECT * FROM ascora_customers
       WHERE organization_id = $1 AND ascora_customer_id = $2`,
      [organizationId, customer.id]
    );

    if (existing.rows.length > 0) {
      // Update existing
      await this.db.query(
        `UPDATE ascora_customers SET
         first_name = $1, last_name = $2, company_name = $3, email = $4,
         phone = $5, mobile = $6, street_address = $7, suburb = $8,
         state = $9, postcode = $10, country = $11, customer_type = $12,
         billing_address = $13, tax_id = $14, notes = $15, custom_fields = $16,
         synced_at = NOW(), updated_at = NOW()
         WHERE organization_id = $17 AND ascora_customer_id = $18`,
        [
          customer.firstName, customer.lastName, customer.companyName, customer.email,
          customer.phone, customer.mobile, customer.streetAddress, customer.suburb,
          customer.state, customer.postcode, customer.country, customer.customerType,
          customer.billingAddress, customer.taxId, customer.notes, JSON.stringify(customer.customFields || {}),
          organizationId, customer.id
        ]
      );
    } else {
      // Insert new
      await this.db.query(
        `INSERT INTO ascora_customers (
          organization_id, ascora_customer_id, first_name, last_name, company_name,
          email, phone, mobile, street_address, suburb, state, postcode, country,
          customer_type, billing_address, tax_id, notes, custom_fields, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())`,
        [
          organizationId, customer.id, customer.firstName, customer.lastName, customer.companyName,
          customer.email, customer.phone, customer.mobile, customer.streetAddress, customer.suburb,
          customer.state, customer.postcode, customer.country, customer.customerType,
          customer.billingAddress, customer.taxId, customer.notes, JSON.stringify(customer.customFields || {})
        ]
      );
    }
  }

  // ===== Job Management =====

  public async createJobFromReport(
    organizationId: string,
    reportId: string
  ): Promise<{ jobId: string; ascoraJobId: string }> {
    const client = await this.getClient(organizationId);

    // Get report data
    const reportResult = await this.db.query(
      `SELECT * FROM reports WHERE report_id = $1 AND organization_id = $2`,
      [reportId, organizationId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error('Report not found');
    }

    const report = reportResult.rows[0];

    // Find or create customer
    let customerId: string;
    if (report.customer_email) {
      const customerResult = await this.db.query(
        `SELECT ascora_customer_id FROM ascora_customers
         WHERE organization_id = $1 AND email = $2`,
        [organizationId, report.customer_email]
      );

      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].ascora_customer_id;
      } else {
        // Create customer in Ascora
        const newCustomer = await client.createCustomer({
          firstName: report.customer_name?.split(' ')[0],
          lastName: report.customer_name?.split(' ').slice(1).join(' '),
          email: report.customer_email,
          phone: report.customer_phone,
          streetAddress: report.location
        });
        customerId = newCustomer.id;

        // Sync to local database
        await this.syncCustomer(organizationId, newCustomer);
      }
    } else {
      throw new Error('Customer email is required to create job');
    }

    // Create job in Ascora
    const jobData: Partial<AscoraJob> = {
      jobTitle: `RestoreAssist Report: ${report.report_id.substring(0, 8)}`,
      customerId: customerId,
      description: `Damage Assessment Report\n\nDamage Type: ${report.damage_type}\nSeverity: ${report.severity}\n\n${report.notes || ''}`,
      jobAddress: report.location,
      jobType: 'damage_assessment',
      priority: this.mapSeverityToPriority(report.severity),
      estimatedCost: report.estimated_cost,
      scheduledDate: report.scheduled_date,
      customFields: {
        restoreassist_report_id: reportId,
        damage_type: report.damage_type,
        severity: report.severity
      }
    };

    const ascoraJob = await client.createJob(jobData);

    // Store in local database
    await this.db.query(
      `INSERT INTO ascora_jobs (
        organization_id, report_id, ascora_job_id, job_title, customer_id,
        customer_name, customer_email, customer_phone, job_status, description,
        job_address, job_type, priority, estimated_cost, scheduled_date,
        custom_fields, sync_direction, last_synced_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
      [
        organizationId, reportId, ascoraJob.id, ascoraJob.jobTitle, ascoraJob.customerId,
        ascoraJob.customerName, ascoraJob.customerEmail, ascoraJob.customerPhone,
        ascoraJob.status, ascoraJob.description, ascoraJob.jobAddress, ascoraJob.jobType,
        ascoraJob.priority, ascoraJob.estimatedCost, ascoraJob.scheduledDate,
        JSON.stringify(ascoraJob.customFields || {}), 'to_ascora'
      ]
    );

    // Create sync log
    const integration = await this.getIntegration(organizationId);
    await this.createSyncLog(
      organizationId,
      integration!.id,
      'job_create',
      'success',
      'report',
      reportId,
      ascoraJob.id
    );

    return { jobId: reportId, ascoraJobId: ascoraJob.id };
  }

  public async syncJobStatus(organizationId: string, jobId: string): Promise<void> {
    const client = await this.getClient(organizationId);

    // Get local job
    const localResult = await this.db.query(
      `SELECT * FROM ascora_jobs WHERE organization_id = $1 AND ascora_job_id = $2`,
      [organizationId, jobId]
    );

    if (localResult.rows.length === 0) {
      throw new Error('Job not found');
    }

    // Get remote job
    const remoteJob = await client.getJob(jobId);

    // Update local database
    await this.db.query(
      `UPDATE ascora_jobs SET
       job_status = $1, description = $2, priority = $3,
       estimated_cost = $4, actual_cost = $5, scheduled_date = $6,
       completed_date = $7, assigned_to = $8, assigned_to_name = $9,
       invoice_status = $10, invoice_amount = $11, payment_status = $12,
       custom_fields = $13, last_synced_at = NOW(), updated_at = NOW()
       WHERE organization_id = $14 AND ascora_job_id = $15`,
      [
        remoteJob.status, remoteJob.description, remoteJob.priority,
        remoteJob.estimatedCost, remoteJob.actualCost, remoteJob.scheduledDate,
        remoteJob.completedDate, remoteJob.assignedTo, remoteJob.assignedToName,
        remoteJob.invoiceStatus, remoteJob.invoiceAmount, remoteJob.paymentStatus,
        JSON.stringify(remoteJob.customFields || {}), organizationId, jobId
      ]
    );
  }

  public async pushReportToAscora(organizationId: string, reportId: string): Promise<void> {
    // Check if job already exists
    const existing = await this.db.query(
      `SELECT ascora_job_id FROM ascora_jobs
       WHERE organization_id = $1 AND report_id = $2`,
      [organizationId, reportId]
    );

    if (existing.rows.length > 0) {
      // Update existing job
      await this.syncJobStatus(organizationId, existing.rows[0].ascora_job_id);
    } else {
      // Create new job
      await this.createJobFromReport(organizationId, reportId);
    }
  }

  public async pullJobsFromAscora(organizationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const client = await this.getClient(organizationId);

    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 0
    };

    try {
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await client.listJobs({ limit, offset });

        for (const job of response.jobs) {
          try {
            await this.syncJob(organizationId, job);
            result.processed++;
          } catch (error: any) {
            result.failed++;
            result.errors.push({
              resource: 'job',
              id: job.id,
              message: error.message
            });
          }
        }

        hasMore = response.hasMore;
        offset += limit;
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error: any) {
      result.success = false;
      result.errors.push({
        resource: 'sync',
        message: error.message
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  private async syncJob(organizationId: string, job: AscoraJob): Promise<void> {
    const existing = await this.db.query(
      `SELECT * FROM ascora_jobs
       WHERE organization_id = $1 AND ascora_job_id = $2`,
      [organizationId, job.id]
    );

    if (existing.rows.length > 0) {
      // Update
      await this.db.query(
        `UPDATE ascora_jobs SET
         job_title = $1, customer_id = $2, customer_name = $3, customer_email = $4,
         customer_phone = $5, job_status = $6, description = $7, job_address = $8,
         job_type = $9, priority = $10, estimated_cost = $11, actual_cost = $12,
         scheduled_date = $13, completed_date = $14, assigned_to = $15, assigned_to_name = $16,
         invoice_status = $17, invoice_amount = $18, payment_status = $19, custom_fields = $20,
         last_synced_at = NOW(), updated_at = NOW()
         WHERE organization_id = $21 AND ascora_job_id = $22`,
        [
          job.jobTitle, job.customerId, job.customerName, job.customerEmail,
          job.customerPhone, job.status, job.description, job.jobAddress,
          job.jobType, job.priority, job.estimatedCost, job.actualCost,
          job.scheduledDate, job.completedDate, job.assignedTo, job.assignedToName,
          job.invoiceStatus, job.invoiceAmount, job.paymentStatus, JSON.stringify(job.customFields || {}),
          organizationId, job.id
        ]
      );
    } else {
      // Insert
      await this.db.query(
        `INSERT INTO ascora_jobs (
          organization_id, ascora_job_id, job_title, customer_id, customer_name,
          customer_email, customer_phone, job_status, description, job_address,
          job_type, priority, estimated_cost, actual_cost, scheduled_date,
          completed_date, assigned_to, assigned_to_name, invoice_status,
          invoice_amount, payment_status, custom_fields, sync_direction, last_synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())`,
        [
          organizationId, job.id, job.jobTitle, job.customerId, job.customerName,
          job.customerEmail, job.customerPhone, job.status, job.description, job.jobAddress,
          job.jobType, job.priority, job.estimatedCost, job.actualCost, job.scheduledDate,
          job.completedDate, job.assignedTo, job.assignedToName, job.invoiceStatus,
          job.invoiceAmount, job.paymentStatus, JSON.stringify(job.customFields || {}), 'from_ascora'
        ]
      );
    }
  }

  // ===== Invoice Management =====

  public async syncInvoices(organizationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const client = await this.getClient(organizationId);

    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 0
    };

    try {
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await client.listInvoices({ limit, offset });

        for (const invoice of response.invoices) {
          try {
            await this.syncInvoice(organizationId, invoice);
            result.processed++;
          } catch (error: any) {
            result.failed++;
            result.errors.push({
              resource: 'invoice',
              id: invoice.id,
              message: error.message
            });
          }
        }

        hasMore = response.hasMore;
        offset += limit;
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error: any) {
      result.success = false;
      result.errors.push({
        resource: 'sync',
        message: error.message
      });
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  private async syncInvoice(organizationId: string, invoice: AscoraInvoice): Promise<void> {
    const existing = await this.db.query(
      `SELECT * FROM ascora_invoices
       WHERE organization_id = $1 AND ascora_invoice_id = $2`,
      [organizationId, invoice.id]
    );

    if (existing.rows.length > 0) {
      // Update
      await this.db.query(
        `UPDATE ascora_invoices SET
         ascora_job_id = $1, customer_id = $2, invoice_number = $3,
         invoice_date = $4, due_date = $5, total_amount = $6, paid_amount = $7,
         status = $8, payment_method = $9, payment_date = $10,
         synced_at = NOW(), updated_at = NOW()
         WHERE organization_id = $11 AND ascora_invoice_id = $12`,
        [
          invoice.jobId, invoice.customerId, invoice.invoiceNumber,
          invoice.invoiceDate, invoice.dueDate, invoice.totalAmount, invoice.paidAmount,
          invoice.status, invoice.paymentMethod, invoice.paymentDate,
          organizationId, invoice.id
        ]
      );
    } else {
      // Insert
      await this.db.query(
        `INSERT INTO ascora_invoices (
          organization_id, ascora_invoice_id, ascora_job_id, customer_id,
          invoice_number, invoice_date, due_date, total_amount, paid_amount,
          status, payment_method, payment_date, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          organizationId, invoice.id, invoice.jobId, invoice.customerId,
          invoice.invoiceNumber, invoice.invoiceDate, invoice.dueDate,
          invoice.totalAmount, invoice.paidAmount, invoice.status,
          invoice.paymentMethod, invoice.paymentDate
        ]
      );
    }
  }

  public async recordPayment(
    organizationId: string,
    invoiceId: string,
    amount: number,
    paymentMethod: string = 'cash'
  ): Promise<void> {
    const client = await this.getClient(organizationId);

    const payment: AscoraPayment = {
      invoiceId,
      amount,
      paymentMethod,
      paymentDate: new Date().toISOString()
    };

    const updatedInvoice = await client.recordPayment(payment);
    await this.syncInvoice(organizationId, updatedInvoice);
  }

  // ===== Sync Scheduling =====

  public async startSyncSchedule(
    organizationId: string,
    intervalSeconds: number = 300
  ): Promise<void> {
    const integration = await this.getIntegration(organizationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const nextRun = new Date(Date.now() + intervalSeconds * 1000);

    await this.db.query(
      `INSERT INTO ascora_sync_schedules (organization_id, integration_id, sync_interval, is_active, next_run_at)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (integration_id) DO UPDATE SET
       sync_interval = $3, is_active = true, next_run_at = $4, updated_at = NOW()`,
      [organizationId, integration.id, intervalSeconds, nextRun]
    );
  }

  public async stopSyncSchedule(organizationId: string): Promise<void> {
    await this.db.query(
      `UPDATE ascora_sync_schedules SET is_active = false, updated_at = NOW()
       WHERE organization_id = $1`,
      [organizationId]
    );
  }

  public async manualSync(organizationId: string): Promise<{
    customers: SyncResult;
    jobs: SyncResult;
    invoices: SyncResult;
  }> {
    const integration = await this.getIntegration(organizationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const results = {
      customers: { success: true, processed: 0, failed: 0, skipped: 0, errors: [], duration: 0 } as SyncResult,
      jobs: { success: true, processed: 0, failed: 0, skipped: 0, errors: [], duration: 0 } as SyncResult,
      invoices: { success: true, processed: 0, failed: 0, skipped: 0, errors: [], duration: 0 } as SyncResult
    };

    if (integration.syncSettings.syncCustomers) {
      results.customers = await this.syncCustomers(organizationId);
    }

    if (integration.syncSettings.syncJobs) {
      results.jobs = await this.pullJobsFromAscora(organizationId);
    }

    if (integration.syncSettings.syncInvoices) {
      results.invoices = await this.syncInvoices(organizationId);
    }

    return results;
  }

  // ===== Webhook Handling =====

  public async handleJobStatusWebhook(
    organizationId: string,
    webhookData: WebhookData
  ): Promise<void> {
    // Verify webhook signature
    await this.verifyWebhookSignature(organizationId, webhookData);

    const jobId = webhookData.resourceId;
    await this.syncJobStatus(organizationId, jobId);

    // Create activity log
    const integration = await this.getIntegration(organizationId);
    await this.createSyncLog(
      organizationId,
      integration!.id,
      'webhook_job_status',
      'success',
      'job',
      undefined,
      jobId,
      webhookData.data
    );
  }

  public async handlePaymentWebhook(
    organizationId: string,
    webhookData: WebhookData
  ): Promise<void> {
    // Verify webhook signature
    await this.verifyWebhookSignature(organizationId, webhookData);

    const invoiceId = webhookData.resourceId;
    const client = await this.getClient(organizationId);
    const invoice = await client.getInvoice(invoiceId);
    await this.syncInvoice(organizationId, invoice);

    // Create activity log
    const integration = await this.getIntegration(organizationId);
    await this.createSyncLog(
      organizationId,
      integration!.id,
      'webhook_payment',
      'success',
      'invoice',
      undefined,
      invoiceId,
      webhookData.data
    );
  }

  // ===== Conflict Resolution =====

  public async resolveConflicts(
    organizationId: string,
    conflictData: ConflictData
  ): Promise<void> {
    const { resourceType, localData, remoteData, resolution } = conflictData;

    if (!resolution) {
      throw new Error('Conflict resolution strategy required');
    }

    switch (resolution) {
      case 'local':
        // Keep local data, push to remote
        await this.pushLocalToRemote(organizationId, resourceType, localData);
        break;

      case 'remote':
        // Keep remote data, update local
        await this.pullRemoteToLocal(organizationId, resourceType, remoteData);
        break;

      case 'merge':
        // Merge both datasets
        const merged = this.mergeData(localData, remoteData, conflictData.conflictFields);
        await this.pushLocalToRemote(organizationId, resourceType, merged);
        await this.pullRemoteToLocal(organizationId, resourceType, merged);
        break;
    }
  }

  private async pushLocalToRemote(
    organizationId: string,
    resourceType: string,
    data: any
  ): Promise<void> {
    const client = await this.getClient(organizationId);

    switch (resourceType) {
      case 'customer':
        await client.updateCustomer(data.id, data);
        break;
      case 'job':
        await client.updateJob(data.id, data);
        break;
      case 'invoice':
        await client.updateInvoice(data.id, data);
        break;
    }
  }

  private async pullRemoteToLocal(
    organizationId: string,
    resourceType: string,
    data: any
  ): Promise<void> {
    switch (resourceType) {
      case 'customer':
        await this.syncCustomer(organizationId, data);
        break;
      case 'job':
        await this.syncJob(organizationId, data);
        break;
      case 'invoice':
        await this.syncInvoice(organizationId, data);
        break;
    }
  }

  private mergeData(local: any, remote: any, conflictFields: string[]): any {
    const merged = { ...remote };

    // For conflict fields, prefer newer timestamp
    for (const field of conflictFields) {
      if (local.updated_at > remote.updatedAt) {
        merged[field] = local[field];
      }
    }

    return merged;
  }

  // ===== Utility Methods =====

  public async getSyncStatus(organizationId: string): Promise<{
    status: string;
    lastSync: Date | null;
    totalCustomers: number;
    totalJobs: number;
    totalInvoices: number;
    recentLogs: any[];
  }> {
    const integration = await this.getIntegration(organizationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    const customersResult = await this.db.query(
      `SELECT COUNT(*) FROM ascora_customers WHERE organization_id = $1`,
      [organizationId]
    );

    const jobsResult = await this.db.query(
      `SELECT COUNT(*) FROM ascora_jobs WHERE organization_id = $1`,
      [organizationId]
    );

    const invoicesResult = await this.db.query(
      `SELECT COUNT(*) FROM ascora_invoices WHERE organization_id = $1`,
      [organizationId]
    );

    const logsResult = await this.db.query(
      `SELECT * FROM ascora_sync_logs
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [organizationId]
    );

    return {
      status: integration.syncStatus,
      lastSync: integration.lastSyncAt || null,
      totalCustomers: parseInt(customersResult.rows[0].count),
      totalJobs: parseInt(jobsResult.rows[0].count),
      totalInvoices: parseInt(invoicesResult.rows[0].count),
      recentLogs: logsResult.rows
    };
  }

  public async resyncFailedItems(organizationId: string): Promise<SyncResult> {
    const failedLogs = await this.db.query(
      `SELECT * FROM ascora_sync_logs
       WHERE organization_id = $1 AND status = 'failed'
       ORDER BY created_at DESC
       LIMIT 100`,
      [organizationId]
    );

    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 0
    };

    const startTime = Date.now();

    for (const log of failedLogs.rows) {
      try {
        if (log.retry_count >= 3) {
          result.skipped++;
          continue;
        }

        // Retry the sync based on resource type
        switch (log.resource_type) {
          case 'customer':
            if (log.ascora_resource_id) {
              const client = await this.getClient(organizationId);
              const customer = await client.getCustomer(log.ascora_resource_id);
              await this.syncCustomer(organizationId, customer);
            }
            break;
          case 'job':
            if (log.ascora_resource_id) {
              await this.syncJobStatus(organizationId, log.ascora_resource_id);
            }
            break;
          case 'invoice':
            if (log.ascora_resource_id) {
              const client = await this.getClient(organizationId);
              const invoice = await client.getInvoice(log.ascora_resource_id);
              await this.syncInvoice(organizationId, invoice);
            }
            break;
        }

        // Update log
        await this.db.query(
          `UPDATE ascora_sync_logs SET status = 'success', retry_count = retry_count + 1
           WHERE id = $1`,
          [log.id]
        );

        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          resource: log.resource_type,
          id: log.ascora_resource_id,
          message: error.message
        });

        // Update log
        await this.db.query(
          `UPDATE ascora_sync_logs SET retry_count = retry_count + 1, error_message = $1
           WHERE id = $2`,
          [error.message, log.id]
        );
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  // ===== Helper Methods =====

  private mapSeverityToPriority(severity?: string): 'low' | 'normal' | 'high' | 'urgent' {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'urgent';
      case 'high':
        return 'high';
      case 'medium':
        return 'normal';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }

  private async updateSyncStatus(
    organizationId: string,
    status: 'idle' | 'syncing' | 'success' | 'error'
  ): Promise<void> {
    await this.db.query(
      `UPDATE ascora_integrations SET sync_status = $1, updated_at = NOW()
       WHERE organization_id = $2`,
      [status, organizationId]
    );
  }

  private async updateLastSyncTime(organizationId: string): Promise<void> {
    await this.db.query(
      `UPDATE ascora_integrations SET last_sync_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1`,
      [organizationId]
    );
  }

  private async createSyncLog(
    organizationId: string,
    integrationId: string,
    syncType: string,
    status: 'success' | 'failed' | 'pending' | 'skipped',
    resourceType?: string,
    resourceId?: string,
    ascoraResourceId?: string,
    responseData?: any
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO ascora_sync_logs (
        organization_id, integration_id, sync_type, resource_type, resource_id,
        ascora_resource_id, status, response_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        organizationId, integrationId, syncType, resourceType, resourceId,
        ascoraResourceId, status, JSON.stringify(responseData || {})
      ]
    );
  }

  private generateWebhookToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  private async verifyWebhookSignature(
    organizationId: string,
    webhookData: WebhookData
  ): Promise<void> {
    const integration = await this.getIntegration(organizationId);
    if (!integration || !integration.webhookToken) {
      throw new Error('Invalid webhook configuration');
    }

    // Implement signature verification logic here
    // This is a placeholder - actual implementation depends on Ascora's webhook signature algorithm
  }

  private mapIntegrationFromDb(row: any): AscoraIntegration {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      apiUrl: row.api_url,
      apiToken: row.api_token, // Still encrypted
      companyCode: row.company_code,
      isActive: row.is_active,
      lastSyncAt: row.last_sync_at,
      syncStatus: row.sync_status,
      webhookToken: row.webhook_token,
      syncSettings: row.sync_settings,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export default AscoraIntegrationService;
