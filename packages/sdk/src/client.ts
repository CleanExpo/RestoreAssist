import type {
  ClientConfig,
  AuthTokens,
  LoginRequest,
  LoginResponse,
  RegisterUserRequest,
  ChangePasswordRequest,
  User,
  UserPayload,
  GenerateReportRequest,
  GeneratedReport,
  ReportListOptions,
  PaginatedResponse,
  UpdateReportRequest,
  ExportOptions,
  ExportResult,
  Statistics,
  AdminStatistics,
  CleanupOptions,
  CleanupResult,
  HealthCheck,
  Integration,
  IntegrationStatus,
  ServiceM8Job,
  ServiceM8SyncResult,
  ServiceM8Stats,
  GoogleDriveAuthUrl,
  GoogleDriveSaveResult,
  GoogleDriveFile,
  GoogleDriveStats,
} from './types';

import {
  RestoreAssistError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  NetworkError,
} from './types';

// ============================================================================
// HTTP Client
// ============================================================================

class HttpClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private timeout: number;
  private onTokenRefresh?: (tokens: AuthTokens) => void;
  private onError?: (error: RestoreAssistError) => void;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:3001/api';
    this.timeout = config.timeout || 30000;
    this.onTokenRefresh = config.onTokenRefresh;
    this.onError = config.onError;
  }

  setTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.onTokenRefresh?.(tokens);
  }

  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth token if available
    if (this.accessToken && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      headers['Authorisation'] = `Bearer ${this.accessToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle successful responses
      if (response.ok) {
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json();
        }
        // For blob responses (file downloads)
        return (await response.blob()) as unknown as T;
      }

      // Handle error responses
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      const error = this.createError(response.status, errorData);
      this.onError?.(error);
      throw error;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof RestoreAssistError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        const error = new NetworkError('Request timeout');
        this.onError?.(error);
        throw error;
      }

      const error = new NetworkError(
        err instanceof Error ? err.message : 'Network request failed'
      );
      this.onError?.(error);
      throw error;
    }
  }

  private createError(status: number, data: any): RestoreAssistError {
    const message = data.message || data.error || 'Unknown error';

    switch (status) {
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new AuthorizationError(message);
      case 404:
        return new NotFoundError(message);
      case 400:
        return new ValidationError(message, data.errors);
      default:
        return new RestoreAssistError(message, status, data);
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// ============================================================================
// API Modules
// ============================================================================

class AuthAPI {
  constructor(private client: HttpClient) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', request);
    this.client.setTokens(response.tokens);
    return response;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post<void>('/auth/logout');
    } finally {
      this.client.clearTokens();
    }
  }

  async getCurrentUser(): Promise<UserPayload> {
    return this.client.get<UserPayload>('/auth/me');
  }

  async refreshToken(): Promise<AuthTokens> {
    const refreshToken = this.client.getRefreshToken();
    if (!refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }

    const tokens = await this.client.post<AuthTokens>('/auth/refresh', {
      refreshToken,
    });

    this.client.setTokens(tokens);
    return tokens;
  }

  async changePassword(request: ChangePasswordRequest): Promise<void> {
    await this.client.post<void>('/auth/change-password', request);
  }

  async register(request: RegisterUserRequest): Promise<User> {
    return this.client.post<User>('/auth/register', request);
  }

  async listUsers(): Promise<User[]> {
    return this.client.get<User[]>('/auth/users');
  }

  async deleteUser(userId: string): Promise<void> {
    await this.client.delete<void>(`/auth/users/${userId}`);
  }
}

class ReportsAPI {
  constructor(private client: HttpClient) {}

  async generate(request: GenerateReportRequest): Promise<GeneratedReport> {
    return this.client.post<GeneratedReport>('/reports', request);
  }

  async list(
    options: ReportListOptions = {}
  ): Promise<PaginatedResponse<GeneratedReport>> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.order) params.set('order', options.order);

    const query = params.toString();
    return this.client.get<PaginatedResponse<GeneratedReport>>(
      `/reports${query ? `?${query}` : ''}`
    );
  }

  async get(reportId: string): Promise<GeneratedReport> {
    return this.client.get<GeneratedReport>(`/reports/${reportId}`);
  }

  async update(
    reportId: string,
    updates: UpdateReportRequest
  ): Promise<GeneratedReport> {
    return this.client.patch<GeneratedReport>(`/reports/${reportId}`, updates);
  }

  async delete(reportId: string): Promise<void> {
    await this.client.delete<void>(`/reports/${reportId}`);
  }

  async export(reportId: string, options: ExportOptions): Promise<ExportResult> {
    return this.client.post<ExportResult>(`/reports/${reportId}/export`, options);
  }

  async getStats(): Promise<Statistics> {
    return this.client.get<Statistics>('/reports/stats');
  }

  async cleanupOld(days: number = 30): Promise<CleanupResult> {
    return this.client.delete<CleanupResult>(
      `/reports/cleanup/old?days=${days}`
    );
  }
}

class ExportsAPI {
  constructor(private client: HttpClient) {}

  async download(fileName: string): Promise<Blob> {
    return this.client.get<Blob>(`/exports/${fileName}`);
  }
}

class AdminAPI {
  constructor(private client: HttpClient) {}

  async getStats(): Promise<AdminStatistics> {
    return this.client.get<AdminStatistics>('/admin/stats');
  }

  async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    return this.client.post<CleanupResult>('/admin/cleanup', options);
  }

  async health(): Promise<HealthCheck> {
    return this.client.get<HealthCheck>('/admin/health');
  }
}

class IntegrationsAPI {
  public servicem8: ServiceM8API;
  public googleDrive: GoogleDriveAPI;

  constructor(private client: HttpClient) {
    this.servicem8 = new ServiceM8API(client);
    this.googleDrive = new GoogleDriveAPI(client);
  }

  async list(): Promise<Integration[]> {
    return this.client.get<Integration[]>('/integrations');
  }
}

class ServiceM8API {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<IntegrationStatus> {
    return this.client.get<IntegrationStatus>('/integrations/servicem8/status');
  }

  async listJobs(): Promise<ServiceM8Job[]> {
    return this.client.get<ServiceM8Job[]>('/integrations/servicem8/jobs');
  }

  async syncReport(jobId: string, reportId: string): Promise<ServiceM8SyncResult> {
    return this.client.post<ServiceM8SyncResult>(
      `/integrations/servicem8/jobs/${jobId}/sync`,
      { reportId }
    );
  }

  async getStats(): Promise<ServiceM8Stats> {
    return this.client.get<ServiceM8Stats>('/integrations/servicem8/stats');
  }
}

class GoogleDriveAPI {
  constructor(private client: HttpClient) {}

  async getStatus(): Promise<IntegrationStatus> {
    return this.client.get<IntegrationStatus>(
      '/integrations/google-drive/status'
    );
  }

  async getAuthUrl(): Promise<GoogleDriveAuthUrl> {
    return this.client.get<GoogleDriveAuthUrl>('/integrations/google-drive/auth');
  }

  async saveReport(reportId: string): Promise<GoogleDriveSaveResult> {
    return this.client.post<GoogleDriveSaveResult>(
      `/integrations/google-drive/reports/${reportId}/save`
    );
  }

  async listFiles(): Promise<GoogleDriveFile[]> {
    return this.client.get<GoogleDriveFile[]>('/integrations/google-drive/files');
  }

  async getStats(): Promise<GoogleDriveStats> {
    return this.client.get<GoogleDriveStats>('/integrations/google-drive/stats');
  }
}

// ============================================================================
// Main Client
// ============================================================================

export class RestoreAssistClient {
  private httpClient: HttpClient;

  public auth: AuthAPI;
  public reports: ReportsAPI;
  public exports: ExportsAPI;
  public admin: AdminAPI;
  public integrations: IntegrationsAPI;

  constructor(config: ClientConfig = {}) {
    this.httpClient = new HttpClient(config);

    // Initialise API modules
    this.auth = new AuthAPI(this.httpClient);
    this.reports = new ReportsAPI(this.httpClient);
    this.exports = new ExportsAPI(this.httpClient);
    this.admin = new AdminAPI(this.httpClient);
    this.integrations = new IntegrationsAPI(this.httpClient);

    // Auto-login if credentials provided
    if (config.credentials) {
      this.auth.login(config.credentials).catch((error) => {
        console.error('Auto-login failed:', error);
        config.onError?.(error);
      });
    }
  }

  /**
   * Check if the client is authenticated
   */
  isAuthenticated(): boolean {
    return this.httpClient.getAccessToken() !== null;
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return this.httpClient.getAccessToken();
  }

  /**
   * Manually set authentication tokens
   */
  setTokens(tokens: AuthTokens): void {
    this.httpClient.setTokens(tokens);
  }

  /**
   * Clear authentication tokens
   */
  clearTokens(): void {
    this.httpClient.clearTokens();
  }
}
