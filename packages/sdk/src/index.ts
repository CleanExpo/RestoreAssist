// Main client export
export { RestoreAssistClient } from './client';

// Export all types
export type {
  // Core types
  DamageType,
  AustralianState,
  UserRole,
  ExportFormat,

  // User & Authentication
  User,
  UserPayload,
  AuthTokens,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RegisterUserRequest,
  ChangePasswordRequest,

  // Reports
  GenerateReportRequest,
  ReportItem,
  GeneratedReport,
  ReportListOptions,
  PaginatedResponse,
  UpdateReportRequest,

  // Exports
  ExportOptions,
  ExportResult,

  // Statistics
  Statistics,
  AdminStatistics,

  // Admin
  CleanupOptions,
  CleanupResult,
  HealthCheck,

  // Integrations
  Integration,
  IntegrationStatus,
  ServiceM8Job,
  ServiceM8SyncResult,
  ServiceM8Stats,
  GoogleDriveAuthUrl,
  GoogleDriveSaveResult,
  GoogleDriveFile,
  GoogleDriveStats,

  // Configuration
  ClientConfig,
} from './types';

// Export error classes
export {
  RestoreAssistError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  NetworkError,
} from './types';
