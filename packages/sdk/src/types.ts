// ============================================================================
// Core Types
// ============================================================================

export type DamageType = 'water' | 'fire' | 'storm' | 'flood' | 'mold';

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export type UserRole = 'admin' | 'user' | 'viewer';

export type ExportFormat = 'pdf' | 'docx';

// ============================================================================
// User & Authentication Types
// ============================================================================

export interface User {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  company?: string;
  createdAt: string;
  lastLogin?: string;
}

export interface UserPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserPayload;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RegisterUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  company?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ============================================================================
// Report Types
// ============================================================================

export interface GenerateReportRequest {
  propertyAddress: string;
  damageType: DamageType;
  damageDescription: string;
  state: AustralianState;
  clientName?: string;
  insuranceCompany?: string;
  claimNumber?: string;
}

export interface ReportItem {
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  category: string;
}

export interface GeneratedReport {
  reportId: string;
  timestamp: string;
  propertyAddress: string;
  damageType: DamageType;
  state: AustralianState;
  summary: string;
  severity: string;
  urgent: boolean;
  recommendations: string[];
  scopeOfWork: string[];
  itemizedEstimate: ReportItem[];
  totalCost: number;
  complianceNotes: string[];
  authorityToProceed: string;
  metadata: {
    clientName?: string;
    insuranceCompany?: string;
    claimNumber?: string;
    generatedBy: string;
    model: string;
  };
}

export interface ReportListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'timestamp' | 'totalCost';
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  reports: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UpdateReportRequest {
  propertyAddress?: string;
  damageType?: DamageType;
  state?: AustralianState;
  summary?: string;
  scopeOfWork?: string[];
  itemizedEstimate?: ReportItem[];
  totalCost?: number;
  complianceNotes?: string[];
  authorityToProceed?: string;
  metadata?: Partial<GeneratedReport['metadata']>;
}

// ============================================================================
// Export Types
// ============================================================================

export interface ExportOptions {
  format: ExportFormat;
  email?: string;
  includeCharts?: boolean;
  includeBranding?: boolean;
}

export interface ExportResult {
  success: boolean;
  fileName: string;
  downloadUrl: string;
  emailSent?: boolean;
  message: string;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface Statistics {
  totalReports: number;
  totalValue: number;
  averageValue: number;
  byDamageType: Record<DamageType, number>;
  byState: Record<AustralianState, number>;
  recentReports: number;
}

export interface AdminStatistics extends Statistics {
  systemInfo: {
    uptime: number;
    memory: {
      used: number;
      total: number;
    };
    database: string;
  };
  userStats: {
    totalUsers: number;
    activeUsers: number;
    byRole: Record<UserRole, number>;
  };
}

// ============================================================================
// Admin Types
// ============================================================================

export interface CleanupOptions {
  days?: number;
}

export interface CleanupResult {
  message: string;
  deletedCount: number;
  days: number;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  environment: string;
  database?: {
    connected: boolean;
    type: string;
  };
}

// ============================================================================
// Integration Types
// ============================================================================

export interface Integration {
  name: string;
  enabled: boolean;
  description: string;
  configRequired: string[];
}

export interface IntegrationStatus {
  enabled: boolean;
  configured: boolean;
  lastSync?: string;
  error?: string;
}

// ServiceM8 Integration
export interface ServiceM8Job {
  uuid: string;
  status: string;
  job_address: string;
  description: string;
  created_at: string;
}

export interface ServiceM8SyncResult {
  success: boolean;
  jobId: string;
  reportId: string;
  message: string;
}

export interface ServiceM8Stats {
  totalJobs: number;
  syncedReports: number;
  lastSync?: string;
}

// Google Drive Integration
export interface GoogleDriveAuthUrl {
  authUrl: string;
  state: string;
}

export interface GoogleDriveSaveResult {
  success: boolean;
  fileId: string;
  fileName: string;
  webViewLink: string;
  message: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  size?: string;
}

export interface GoogleDriveStats {
  totalFiles: number;
  totalSize: number;
  lastUpload?: string;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface ClientConfig {
  baseUrl?: string;
  credentials?: {
    email: string;
    password: string;
  };
  onTokenRefresh?: (tokens: AuthTokens) => void;
  onError?: (error: RestoreAssistError) => void;
  timeout?: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class RestoreAssistError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'RestoreAssistError';
    Object.setPrototypeOf(this, RestoreAssistError.prototype);
  }
}

export class AuthenticationError extends RestoreAssistError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends RestoreAssistError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends RestoreAssistError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ValidationError extends RestoreAssistError {
  constructor(message = 'Validation failed', public errors?: Record<string, string[]>) {
    super(message, 400);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NetworkError extends RestoreAssistError {
  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
