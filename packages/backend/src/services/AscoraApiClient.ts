/**
 * Ascora API Client
 * Complete Ascora CRM API wrapper with authentication and request handling
 *
 * Features:
 * - Authentication handling
 * - Customer management
 * - Job operations
 * - Invoice operations
 * - Attachment handling
 * - Task scheduling
 * - Error handling and retry logic
 * - Rate limiting protection
 *
 * @module AscoraApiClient
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

// ===== Type Definitions =====

export interface AscoraConfig {
  apiUrl: string;
  apiToken: string;
  companyCode: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface AscoraCustomer {
  id: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  streetAddress?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  customerType?: string;
  billingAddress?: string;
  taxId?: string;
  notes?: string;
  customFields?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AscoraJob {
  id: string;
  jobTitle: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  status: string;
  description?: string;
  jobAddress?: string;
  jobType?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedCost?: number;
  actualCost?: number;
  scheduledDate?: string;
  completedDate?: string;
  assignedTo?: string;
  assignedToName?: string;
  invoiceStatus?: string;
  invoiceAmount?: number;
  paymentStatus?: string;
  customFields?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AscoraInvoice {
  id: string;
  jobId?: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount?: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  paymentMethod?: string;
  paymentDate?: string;
  items?: AscoraInvoiceItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AscoraInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate?: number;
}

export interface AscoraJobNote {
  id: string;
  jobId: string;
  userId: string;
  userName?: string;
  note: string;
  createdAt: string;
}

export interface AscoraAttachment {
  id: string;
  jobId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  uploadedBy?: string;
  uploadedAt: string;
}

export interface AscoraTask {
  id: string;
  jobId?: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high';
  createdAt?: string;
  updatedAt?: string;
}

export interface AscoraPayment {
  invoiceId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
}

export interface AscoraListOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

// ===== Custom Error Classes =====

export class AscoraApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'AscoraApiError';
  }
}

export class AuthenticationError extends AscoraApiError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends AscoraApiError {
  constructor(message: string = 'Rate limit exceeded', public retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends AscoraApiError {
  constructor(message: string = 'Request timed out') {
    super(message, 408);
    this.name = 'TimeoutError';
  }
}

export class NotFoundError extends AscoraApiError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID ${id} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AscoraApiError {
  constructor(message: string, public validationErrors?: Record<string, string[]>) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

// ===== Main API Client =====

export class AscoraApiClient {
  private client: AxiosInstance;
  private config: Required<AscoraConfig>;
  private isAuthenticated: boolean = false;

  constructor(config: AscoraConfig) {
    this.config = {
      apiUrl: config.apiUrl,
      apiToken: config.apiToken,
      companyCode: config.companyCode,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      timeout: config.timeout || 30000
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.config.apiToken}`,
        'X-Company-Code': this.config.companyCode
      }
    });

    this.setupInterceptors();
  }

  // ===== Setup & Authentication =====

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[Ascora API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        return this.handleError(error);
      }
    );
  }

  public async authenticate(): Promise<boolean> {
    try {
      // Test authentication by fetching a simple endpoint
      await this.client.get('/auth/verify');
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      this.isAuthenticated = false;
      throw new AuthenticationError('Failed to authenticate with Ascora API');
    }
  }

  // ===== Error Handling =====

  private async handleError(error: AxiosError): Promise<never> {
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        throw new TimeoutError();
      }
      throw new AscoraApiError('Network error: ' + error.message);
    }

    const { status, data } = error.response;

    switch (status) {
      case 401:
        throw new AuthenticationError(data?.message || 'Authentication failed');

      case 404:
        throw new NotFoundError('Resource', data?.id || 'unknown');

      case 429:
        const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
        throw new RateLimitError('Rate limit exceeded', retryAfter);

      case 400:
        throw new ValidationError(
          data?.message || 'Validation failed',
          data?.errors
        );

      default:
        throw new AscoraApiError(
          data?.message || `Request failed with status ${status}`,
          status,
          data
        );
    }
  }

  private async retryRequest<T>(
    fn: () => Promise<T>,
    retries: number = this.config.maxRetries
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await this.delay(this.config.retryDelay);
        return this.retryRequest(fn, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    return (
      error instanceof TimeoutError ||
      error instanceof RateLimitError ||
      (error instanceof AscoraApiError && error.statusCode && error.statusCode >= 500)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== Customer Operations =====

  public async getCustomer(customerId: string): Promise<AscoraCustomer> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/customers/${customerId}`);
      return response.data;
    });
  }

  public async listCustomers(options: AscoraListOptions = {}): Promise<{
    customers: AscoraCustomer[];
    total: number;
    hasMore: boolean;
  }> {
    return this.retryRequest(async () => {
      const params = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        sort_by: options.sortBy,
        sort_order: options.sortOrder,
        ...options.filters
      };

      const response = await this.client.get('/customers', { params });
      return {
        customers: response.data.data || [],
        total: response.data.total || 0,
        hasMore: response.data.hasMore || false
      };
    });
  }

  public async createCustomer(customerData: Partial<AscoraCustomer>): Promise<AscoraCustomer> {
    return this.retryRequest(async () => {
      const response = await this.client.post('/customers', customerData);
      return response.data;
    });
  }

  public async updateCustomer(
    customerId: string,
    updates: Partial<AscoraCustomer>
  ): Promise<AscoraCustomer> {
    return this.retryRequest(async () => {
      const response = await this.client.put(`/customers/${customerId}`, updates);
      return response.data;
    });
  }

  public async deleteCustomer(customerId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/customers/${customerId}`);
    });
  }

  public async searchCustomers(query: string): Promise<AscoraCustomer[]> {
    return this.retryRequest(async () => {
      const response = await this.client.get('/customers/search', {
        params: { q: query }
      });
      return response.data.data || [];
    });
  }

  // ===== Job Operations =====

  public async getJob(jobId: string): Promise<AscoraJob> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/jobs/${jobId}`);
      return response.data;
    });
  }

  public async listJobs(options: AscoraListOptions & {
    customerId?: string;
    status?: string;
  } = {}): Promise<{
    jobs: AscoraJob[];
    total: number;
    hasMore: boolean;
  }> {
    return this.retryRequest(async () => {
      const params = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        customer_id: options.customerId,
        status: options.status,
        sort_by: options.sortBy,
        sort_order: options.sortOrder,
        ...options.filters
      };

      const response = await this.client.get('/jobs', { params });
      return {
        jobs: response.data.data || [],
        total: response.data.total || 0,
        hasMore: response.data.hasMore || false
      };
    });
  }

  public async createJob(jobData: Partial<AscoraJob>): Promise<AscoraJob> {
    return this.retryRequest(async () => {
      const response = await this.client.post('/jobs', jobData);
      return response.data;
    });
  }

  public async updateJob(jobId: string, updates: Partial<AscoraJob>): Promise<AscoraJob> {
    return this.retryRequest(async () => {
      const response = await this.client.put(`/jobs/${jobId}`, updates);
      return response.data;
    });
  }

  public async updateJobStatus(jobId: string, status: string): Promise<AscoraJob> {
    return this.retryRequest(async () => {
      const response = await this.client.patch(`/jobs/${jobId}/status`, { status });
      return response.data;
    });
  }

  public async deleteJob(jobId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/jobs/${jobId}`);
    });
  }

  // ===== Job Notes =====

  public async addJobNote(jobId: string, note: string): Promise<AscoraJobNote> {
    return this.retryRequest(async () => {
      const response = await this.client.post(`/jobs/${jobId}/notes`, { note });
      return response.data;
    });
  }

  public async getJobNotes(jobId: string): Promise<AscoraJobNote[]> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/jobs/${jobId}/notes`);
      return response.data.data || [];
    });
  }

  public async updateJobNote(
    jobId: string,
    noteId: string,
    note: string
  ): Promise<AscoraJobNote> {
    return this.retryRequest(async () => {
      const response = await this.client.put(`/jobs/${jobId}/notes/${noteId}`, { note });
      return response.data;
    });
  }

  public async deleteJobNote(jobId: string, noteId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/jobs/${jobId}/notes/${noteId}`);
    });
  }

  // ===== Invoice Operations =====

  public async listInvoices(options: AscoraListOptions & {
    jobId?: string;
    status?: string;
    customerId?: string;
  } = {}): Promise<{
    invoices: AscoraInvoice[];
    total: number;
    hasMore: boolean;
  }> {
    return this.retryRequest(async () => {
      const params = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        job_id: options.jobId,
        customer_id: options.customerId,
        status: options.status,
        sort_by: options.sortBy,
        sort_order: options.sortOrder,
        ...options.filters
      };

      const response = await this.client.get('/invoices', { params });
      return {
        invoices: response.data.data || [],
        total: response.data.total || 0,
        hasMore: response.data.hasMore || false
      };
    });
  }

  public async getInvoice(invoiceId: string): Promise<AscoraInvoice> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/invoices/${invoiceId}`);
      return response.data;
    });
  }

  public async createInvoice(invoiceData: Partial<AscoraInvoice>): Promise<AscoraInvoice> {
    return this.retryRequest(async () => {
      const response = await this.client.post('/invoices', invoiceData);
      return response.data;
    });
  }

  public async updateInvoice(
    invoiceId: string,
    updates: Partial<AscoraInvoice>
  ): Promise<AscoraInvoice> {
    return this.retryRequest(async () => {
      const response = await this.client.put(`/invoices/${invoiceId}`, updates);
      return response.data;
    });
  }

  public async deleteInvoice(invoiceId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/invoices/${invoiceId}`);
    });
  }

  public async recordPayment(payment: AscoraPayment): Promise<AscoraInvoice> {
    return this.retryRequest(async () => {
      const response = await this.client.post(
        `/invoices/${payment.invoiceId}/payments`,
        payment
      );
      return response.data;
    });
  }

  public async sendInvoice(invoiceId: string, email?: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.post(`/invoices/${invoiceId}/send`, { email });
    });
  }

  // ===== Attachment Operations =====

  public async addAttachment(
    jobId: string,
    file: Buffer,
    fileName: string,
    fileType?: string
  ): Promise<AscoraAttachment> {
    return this.retryRequest(async () => {
      const formData = new FormData();
      formData.append('file', new Blob([file]), fileName);
      if (fileType) formData.append('fileType', fileType);

      const response = await this.client.post(
        `/jobs/${jobId}/attachments`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return response.data;
    });
  }

  public async listAttachments(jobId: string): Promise<AscoraAttachment[]> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/jobs/${jobId}/attachments`);
      return response.data.data || [];
    });
  }

  public async getAttachment(jobId: string, attachmentId: string): Promise<AscoraAttachment> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/jobs/${jobId}/attachments/${attachmentId}`);
      return response.data;
    });
  }

  public async deleteAttachment(jobId: string, attachmentId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/jobs/${jobId}/attachments/${attachmentId}`);
    });
  }

  // ===== Task Operations =====

  public async scheduleTask(taskData: Partial<AscoraTask>): Promise<AscoraTask> {
    return this.retryRequest(async () => {
      const response = await this.client.post('/tasks', taskData);
      return response.data;
    });
  }

  public async getTask(taskId: string): Promise<AscoraTask> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/tasks/${taskId}`);
      return response.data;
    });
  }

  public async listTasks(options: AscoraListOptions & {
    jobId?: string;
    assignedTo?: string;
    status?: string;
  } = {}): Promise<{
    tasks: AscoraTask[];
    total: number;
    hasMore: boolean;
  }> {
    return this.retryRequest(async () => {
      const params = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        job_id: options.jobId,
        assigned_to: options.assignedTo,
        status: options.status,
        sort_by: options.sortBy,
        sort_order: options.sortOrder,
        ...options.filters
      };

      const response = await this.client.get('/tasks', { params });
      return {
        tasks: response.data.data || [],
        total: response.data.total || 0,
        hasMore: response.data.hasMore || false
      };
    });
  }

  public async updateTask(taskId: string, updates: Partial<AscoraTask>): Promise<AscoraTask> {
    return this.retryRequest(async () => {
      const response = await this.client.put(`/tasks/${taskId}`, updates);
      return response.data;
    });
  }

  public async deleteTask(taskId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/tasks/${taskId}`);
    });
  }

  // ===== Custom Fields =====

  public async getCustomFields(resourceType: 'customer' | 'job' | 'invoice'): Promise<{
    fields: Array<{
      name: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  }> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/custom-fields/${resourceType}`);
      return response.data;
    });
  }

  // ===== Utility Methods =====

  public getConfig(): Readonly<AscoraConfig> {
    return { ...this.config };
  }

  public isAuthenticatedStatus(): boolean {
    return this.isAuthenticated;
  }

  public updateApiToken(newToken: string): void {
    this.config.apiToken = newToken;
    this.client.defaults.headers['Authorization'] = `Bearer ${newToken}`;
    this.isAuthenticated = false;
  }

  public updateCompanyCode(newCode: string): void {
    this.config.companyCode = newCode;
    this.client.defaults.headers['X-Company-Code'] = newCode;
  }
}

export default AscoraApiClient;
