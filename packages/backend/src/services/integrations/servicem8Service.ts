/**
 * ServiceM8 CRM Integration Service
 *
 * Provides integration with ServiceM8 field service management platform.
 * Enables syncing restoration reports with ServiceM8 jobs.
 */

import {
  ServiceM8Job,
  ServiceM8JobCreateRequest,
  ServiceM8JobUpdateRequest,
  ServiceM8JobsListResponse,
  SyncRecord,
  SyncReportToJobRequest,
  SyncReportToJobResponse,
  SyncStatus,
  IntegrationStats
} from '../../types/integrations';
import { GeneratedReport } from '../../types';

/**
 * ServiceM8 API Client
 *
 * Handles authentication and communication with ServiceM8 REST API
 */
class ServiceM8Service {
  private apiKey: string;
  private domain: string;
  private baseUrl: string;
  private syncRecords: Map<string, SyncRecord>;

  constructor() {
    this.apiKey = process.env.SERVICEM8_API_KEY || '';
    this.domain = process.env.SERVICEM8_DOMAIN || '';
    this.baseUrl = `https://${this.domain}.servicem8.com/api/v1`;
    this.syncRecords = new Map();

    if (!this.apiKey) {
      console.warn('⚠️  SERVICEM8_API_KEY not configured - ServiceM8 integration disabled');
    }
    if (!this.domain) {
      console.warn('⚠️  SERVICEM8_DOMAIN not configured - ServiceM8 integration disabled');
    }
  }

  /**
   * Check if ServiceM8 integration is enabled
   */
  isEnabled(): boolean {
    return !!(this.apiKey && this.domain);
  }

  /**
   * Make authenticated request to ServiceM8 API
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.isEnabled()) {
      throw new Error('ServiceM8 integration not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorisation': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `ServiceM8 API error (${response.status}): ${errorText}`
        );
      }

      return await response.json() as T;
    } catch (error) {
      console.error('ServiceM8 API request failed:', error);
      throw error;
    }
  }

  /**
   * Test ServiceM8 API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isEnabled()) {
        return {
          success: false,
          message: 'ServiceM8 integration not configured'
        };
      }

      // Test with a simple endpoint
      await this.makeRequest('/company.json', { method: 'GET' });

      return {
        success: true,
        message: 'ServiceM8 connection successful'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Fetch jobs from ServiceM8
   */
  async fetchJobs(options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}): Promise<ServiceM8JobsListResponse> {
    const {
      page = 1,
      limit = 20,
      status,
      search
    } = options;

    // Build query parameters
    const params = new URLSearchParams({
      offset: String((page - 1) * limit),
      limit: String(limit),
    });

    if (status) {
      params.append('status', status);
    }
    if (search) {
      params.append('search', search);
    }

    try {
      const response = await this.makeRequest<any>(
        `/jobs.json?${params.toString()}`,
        { method: 'GET' }
      );

      // ServiceM8 returns array directly or wrapped in object
      const jobs = Array.isArray(response) ? response : response.data || [];

      return {
        jobs: jobs.map(this.mapServiceM8Job),
        total: jobs.length,
        page,
        limit
      };
    } catch (error) {
      console.error('Failed to fetch ServiceM8 jobs:', error);
      throw error;
    }
  }

  /**
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<ServiceM8Job> {
    try {
      const response = await this.makeRequest<any>(
        `/jobs/${jobId}.json`,
        { method: 'GET' }
      );

      return this.mapServiceM8Job(response);
    } catch (error) {
      console.error(`Failed to fetch ServiceM8 job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new job in ServiceM8
   */
  async createJob(jobData: ServiceM8JobCreateRequest): Promise<ServiceM8Job> {
    try {
      const response = await this.makeRequest<any>(
        '/jobs.json',
        {
          method: 'POST',
          body: JSON.stringify(this.mapToServiceM8Format(jobData))
        }
      );

      return this.mapServiceM8Job(response);
    } catch (error) {
      console.error('Failed to create ServiceM8 job:', error);
      throw error;
    }
  }

  /**
   * Update an existing job in ServiceM8
   */
  async updateJob(
    jobId: string,
    updates: ServiceM8JobUpdateRequest
  ): Promise<ServiceM8Job> {
    try {
      const response = await this.makeRequest<any>(
        `/jobs/${jobId}.json`,
        {
          method: 'PUT',
          body: JSON.stringify(this.mapToServiceM8Format(updates))
        }
      );

      return this.mapServiceM8Job(response);
    } catch (error) {
      console.error(`Failed to update ServiceM8 job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Sync a RestoreAssist report to a ServiceM8 job
   */
  async syncReportToJob(
    report: GeneratedReport,
    request: SyncReportToJobRequest
  ): Promise<SyncReportToJobResponse> {
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create sync record
    const syncRecord: SyncRecord = {
      syncId,
      reportId: request.reportId,
      serviceM8JobId: request.serviceM8JobId,
      status: 'syncing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncData: {
        reportSnapshot: report
      }
    };

    this.syncRecords.set(syncId, syncRecord);

    try {
      // Build update data based on sync fields
      const syncFields = request.syncFields || {
        description: true,
        address: true,
        cost: true,
        customFields: true
      };

      const updates: ServiceM8JobUpdateRequest = {};

      if (syncFields.description) {
        updates.job_description = this.buildJobDescription(report);
      }

      if (syncFields.address) {
        updates.job_address = report.propertyAddress;
      }

      if (syncFields.cost) {
        updates.total_invoice_amount = report.totalCost;
      }

      if (syncFields.customFields) {
        updates.custom_fields = {
          restore_assist_report_id: report.reportId,
          damage_type: report.damageType,
          severity: report.severity,
          urgent: report.urgent,
          state: report.state,
          generated_at: report.timestamp
        };
      }

      // Update the ServiceM8 job
      const updatedJob = await this.updateJob(
        request.serviceM8JobId,
        updates
      );

      // Update sync record
      syncRecord.status = 'synced';
      syncRecord.lastSyncAt = new Date().toISOString();
      syncRecord.updatedAt = new Date().toISOString();
      syncRecord.syncData!.jobSnapshot = updatedJob;
      this.syncRecords.set(syncId, syncRecord);

      return {
        success: true,
        syncRecord,
        updatedJob,
        message: 'Report synced to ServiceM8 job successfully'
      };
    } catch (error) {
      // Update sync record with error
      syncRecord.status = 'failed';
      syncRecord.errorMessage = error instanceof Error ? error.message : 'Sync failed';
      syncRecord.updatedAt = new Date().toISOString();
      this.syncRecords.set(syncId, syncRecord);

      return {
        success: false,
        syncRecord,
        message: `Sync failed: ${syncRecord.errorMessage}`
      };
    }
  }

  /**
   * Get sync record by ID
   */
  getSyncRecord(syncId: string): SyncRecord | undefined {
    return this.syncRecords.get(syncId);
  }

  /**
   * Get all sync records for a report
   */
  getSyncRecordsByReport(reportId: string): SyncRecord[] {
    return Array.from(this.syncRecords.values())
      .filter(record => record.reportId === reportId)
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  /**
   * Get integration statistics
   */
  getStats(): IntegrationStats {
    const allRecords = Array.from(this.syncRecords.values());
    const successfulSyncs = allRecords.filter(r => r.status === 'synced').length;
    const failedSyncs = allRecords.filter(r => r.status === 'failed').length;
    const lastSync = allRecords.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];

    return {
      servicem8: {
        totalSyncs: allRecords.length,
        successfulSyncs,
        failedSyncs,
        lastSyncAt: lastSync?.updatedAt,
        connectedJobs: new Set(allRecords.map(r => r.serviceM8JobId)).size
      }
    };
  }

  /**
   * Build job description from report
   */
  private buildJobDescription(report: GeneratedReport): string {
    const sections = [
      `Property Damage Assessment - ${report.damageType}`,
      '',
      `Severity: ${report.severity}`,
      `Urgent: ${report.urgent ? 'Yes' : 'No'}`,
      '',
      'Summary:',
      report.summary,
      '',
      'Recommendations:',
      ...report.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`),
      '',
      `Total Estimated Cost: $${report.totalCost.toLocaleString()}`,
      '',
      `Generated: ${new Date(report.timestamp).toLocaleString()}`,
      `Report ID: ${report.reportId}`
    ];

    return sections.join('\n');
  }

  /**
   * Map ServiceM8 API response to our Job type
   */
  private mapServiceM8Job(data: any): ServiceM8Job {
    return {
      uuid: data.uuid || data.job_id || data.id,
      job_address: data.job_address || data.address || '',
      job_description: data.job_description || data.description || '',
      status: data.status || 'Quote',
      contact_first: data.contact_first || data.first_name || '',
      contact_last: data.contact_last || data.last_name || '',
      contact_email: data.contact_email || data.email || '',
      contact_phone: data.contact_phone || data.phone || '',
      total_invoice_amount: data.total_invoice_amount || data.total || 0,
      created_date: data.created_date || data.created_at || new Date().toISOString(),
      updated_date: data.updated_date || data.updated_at || new Date().toISOString(),
      custom_fields: data.custom_fields || {}
    };
  }

  /**
   * Map our format to ServiceM8 API format
   */
  private mapToServiceM8Format(data: any): any {
    const mapped: any = {};

    if (data.job_address !== undefined) mapped.job_address = data.job_address;
    if (data.job_description !== undefined) mapped.job_description = data.job_description;
    if (data.status !== undefined) mapped.status = data.status;
    if (data.contact_first !== undefined) mapped.contact_first = data.contact_first;
    if (data.contact_last !== undefined) mapped.contact_last = data.contact_last;
    if (data.contact_email !== undefined) mapped.contact_email = data.contact_email;
    if (data.contact_phone !== undefined) mapped.contact_phone = data.contact_phone;
    if (data.total_invoice_amount !== undefined) mapped.total_invoice_amount = data.total_invoice_amount;
    if (data.custom_fields !== undefined) mapped.custom_fields = data.custom_fields;

    return mapped;
  }

  /**
   * Clear all sync records (for testing/development)
   */
  clearSyncRecords(): void {
    this.syncRecords.clear();
  }
}

// Export singleton instance
export const servicem8Service = new ServiceM8Service();
