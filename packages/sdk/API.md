# RestoreAssist SDK API Documentation

Complete API reference for the RestoreAssist SDK.

## Table of Contents

- [Client Configuration](#client-configuration)
- [Authentication API](#authentication-api)
- [Reports API](#reports-api)
- [Exports API](#exports-api)
- [Admin API](#admin-api)
- [Integrations API](#integrations-api)
- [Error Handling](#error-handling)
- [Types Reference](#types-reference)

---

## Client Configuration

### RestoreAssistClient

```typescript
new RestoreAssistClient(config?: ClientConfig)
```

#### ClientConfig

```typescript
interface ClientConfig {
  baseUrl?: string;                              // Default: 'http://localhost:3001/api'
  credentials?: {
    email: string;
    password: string;
  };
  onTokenRefresh?: (tokens: AuthTokens) => void; // Called when tokens are refreshed
  onError?: (error: RestoreAssistError) => void; // Global error handler
  timeout?: number;                              // Request timeout in ms (default: 30000)
}
```

#### Example

```typescript
const client = new RestoreAssistClient({
  baseUrl: 'https://api.restoreassist.com/api',
  credentials: {
    email: 'user@example.com',
    password: 'password'
  },
  onTokenRefresh: (tokens) => {
    console.log('Tokens refreshed');
    // Save tokens to local storage or state
  },
  onError: (error) => {
    console.error('SDK Error:', error.message);
  },
  timeout: 60000 // 60 seconds
});
```

### Client Methods

#### isAuthenticated()

Check if the client is authenticated.

```typescript
client.isAuthenticated(): boolean
```

#### getAccessToken()

Get the current access token.

```typescript
client.getAccessToken(): string | null
```

#### setTokens()

Manually set authentication tokens.

```typescript
client.setTokens(tokens: AuthTokens): void
```

#### clearTokens()

Clear authentication tokens.

```typescript
client.clearTokens(): void
```

---

## Authentication API

Access via `client.auth`

### login()

Authenticate a user and obtain access tokens.

```typescript
await client.auth.login(request: LoginRequest): Promise<LoginResponse>
```

**Parameters:**

```typescript
interface LoginRequest {
  email: string;
  password: string;
}
```

**Returns:**

```typescript
interface LoginResponse {
  user: UserPayload;
  tokens: AuthTokens;
}
```

**Example:**

```typescript
const { user, tokens } = await client.auth.login({
  email: 'user@example.com',
  password: 'password123'
});
console.log('Logged in as:', user.name);
```

### logout()

Log out the current user and clear tokens.

```typescript
await client.auth.logout(): Promise<void>
```

### getCurrentUser()

Get the currently authenticated user's information.

```typescript
await client.auth.getCurrentUser(): Promise<UserPayload>
```

**Returns:**

```typescript
interface UserPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole; // 'admin' | 'user' | 'viewer'
}
```

### refreshToken()

Refresh the access token using the refresh token.

```typescript
await client.auth.refreshToken(): Promise<AuthTokens>
```

### changePassword()

Change the current user's password.

```typescript
await client.auth.changePassword(request: ChangePasswordRequest): Promise<void>
```

**Parameters:**

```typescript
interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
```

### register() *[Admin only]*

Register a new user.

```typescript
await client.auth.register(request: RegisterUserRequest): Promise<User>
```

**Parameters:**

```typescript
interface RegisterUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  company?: string;
}
```

### listUsers() *[Admin only]*

List all users in the system.

```typescript
await client.auth.listUsers(): Promise<User[]>
```

### deleteUser() *[Admin only]*

Delete a user by ID.

```typescript
await client.auth.deleteUser(userId: string): Promise<void>
```

---

## Reports API

Access via `client.reports`

### generate()

Generate a new damage assessment report using AI.

```typescript
await client.reports.generate(request: GenerateReportRequest): Promise<GeneratedReport>
```

**Parameters:**

```typescript
interface GenerateReportRequest {
  propertyAddress: string;
  damageType: DamageType; // 'water' | 'fire' | 'storm' | 'flood' | 'mold'
  damageDescription: string;
  state: AustralianState; // 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT'
  clientName?: string;
  insuranceCompany?: string;
  claimNumber?: string;
}
```

**Returns:**

```typescript
interface GeneratedReport {
  reportId: string;
  timestamp: string;
  propertyAddress: string;
  damageType: DamageType;
  state: AustralianState;
  summary: string;
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
```

**Example:**

```typescript
const report = await client.reports.generate({
  propertyAddress: '123 Main St, Sydney NSW 2000',
  damageType: 'water',
  damageDescription: 'Burst pipe causing water damage',
  state: 'NSW',
  clientName: 'John Smith',
  insuranceCompany: 'ABC Insurance',
  claimNumber: 'CLM-001'
});
```

### list()

List reports with pagination and sorting.

```typescript
await client.reports.list(options?: ReportListOptions): Promise<PaginatedResponse<GeneratedReport>>
```

**Parameters:**

```typescript
interface ReportListOptions {
  page?: number;           // Default: 1
  limit?: number;          // Default: 10
  sortBy?: 'timestamp' | 'totalCost'; // Default: 'timestamp'
  order?: 'asc' | 'desc';  // Default: 'desc'
}
```

**Returns:**

```typescript
interface PaginatedResponse<T> {
  reports: T[];
  total: number;
  page: number;
  totalPages: number;
}
```

**Example:**

```typescript
const { reports, total, page, totalPages } = await client.reports.list({
  page: 1,
  limit: 20,
  sortBy: 'totalCost',
  order: 'desc'
});
```

### get()

Get a specific report by ID.

```typescript
await client.reports.get(reportId: string): Promise<GeneratedReport>
```

### update()

Update a report.

```typescript
await client.reports.update(reportId: string, updates: UpdateReportRequest): Promise<GeneratedReport>
```

**Parameters:**

```typescript
interface UpdateReportRequest {
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
```

### delete()

Delete a report.

```typescript
await client.reports.delete(reportId: string): Promise<void>
```

### export()

Export a report to PDF or DOCX format.

```typescript
await client.reports.export(reportId: string, options: ExportOptions): Promise<ExportResult>
```

**Parameters:**

```typescript
interface ExportOptions {
  format: 'pdf' | 'docx';
  email?: string;          // Optional: send via email
  includeCharts?: boolean;
  includeBranding?: boolean;
}
```

**Returns:**

```typescript
interface ExportResult {
  success: boolean;
  fileName: string;
  downloadUrl: string;
  emailSent?: boolean;
  message: string;
}
```

### getStats()

Get report statistics.

```typescript
await client.reports.getStats(): Promise<Statistics>
```

**Returns:**

```typescript
interface Statistics {
  totalReports: number;
  totalValue: number;
  averageValue: number;
  byDamageType: Record<DamageType, number>;
  byState: Record<AustralianState, number>;
  recentReports: number;
}
```

### cleanupOld() *[Admin only]*

Clean up old reports.

```typescript
await client.reports.cleanupOld(days?: number): Promise<CleanupResult>
```

**Parameters:**
- `days` - Number of days (default: 30)

**Returns:**

```typescript
interface CleanupResult {
  message: string;
  deletedCount: number;
  days: number;
}
```

---

## Exports API

Access via `client.exports`

### download()

Download an exported file.

```typescript
await client.exports.download(fileName: string): Promise<Blob>
```

**Example:**

```typescript
const exportResult = await client.reports.export(reportId, { format: 'pdf' });
const blob = await client.exports.download(exportResult.fileName);

// In browser:
const url = URL.createObjectURL(blob);
window.open(url);

// In Node.js:
const buffer = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync('report.pdf', buffer);
```

---

## Admin API

Access via `client.admin`

All admin endpoints require admin role.

### getStats()

Get comprehensive system statistics.

```typescript
await client.admin.getStats(): Promise<AdminStatistics>
```

**Returns:**

```typescript
interface AdminStatistics extends Statistics {
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
```

### cleanup()

Perform administrative cleanup operations.

```typescript
await client.admin.cleanup(options?: CleanupOptions): Promise<CleanupResult>
```

### health()

Check system health.

```typescript
await client.admin.health(): Promise<HealthCheck>
```

**Returns:**

```typescript
interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  environment: string;
  database?: {
    connected: boolean;
    type: string;
  };
}
```

---

## Integrations API

Access via `client.integrations`

### list()

List all available integrations.

```typescript
await client.integrations.list(): Promise<Integration[]>
```

**Returns:**

```typescript
interface Integration {
  name: string;
  enabled: boolean;
  description: string;
  configRequired: string[];
}
```

### ServiceM8 Integration

Access via `client.integrations.servicem8`

#### getStatus()

```typescript
await client.integrations.servicem8.getStatus(): Promise<IntegrationStatus>
```

#### listJobs()

```typescript
await client.integrations.servicem8.listJobs(): Promise<ServiceM8Job[]>
```

#### syncReport()

```typescript
await client.integrations.servicem8.syncReport(jobId: string, reportId: string): Promise<ServiceM8SyncResult>
```

#### getStats()

```typescript
await client.integrations.servicem8.getStats(): Promise<ServiceM8Stats>
```

### Google Drive Integration

Access via `client.integrations.googleDrive`

#### getStatus()

```typescript
await client.integrations.googleDrive.getStatus(): Promise<IntegrationStatus>
```

#### getAuthUrl()

```typescript
await client.integrations.googleDrive.getAuthUrl(): Promise<GoogleDriveAuthUrl>
```

#### saveReport()

```typescript
await client.integrations.googleDrive.saveReport(reportId: string): Promise<GoogleDriveSaveResult>
```

#### listFiles()

```typescript
await client.integrations.googleDrive.listFiles(): Promise<GoogleDriveFile[]>
```

#### getStats()

```typescript
await client.integrations.googleDrive.getStats(): Promise<GoogleDriveStats>
```

---

## Error Handling

The SDK provides comprehensive error handling with specific error types.

### Error Classes

```typescript
// Base error
class RestoreAssistError extends Error {
  statusCode?: number;
  response?: unknown;
}

// Specific errors
class AuthenticationError extends RestoreAssistError  // 401
class AuthorizationError extends RestoreAssistError   // 403
class NotFoundError extends RestoreAssistError        // 404
class ValidationError extends RestoreAssistError      // 400
class NetworkError extends RestoreAssistError         // Network issues
```

### Example

```typescript
import {
  RestoreAssistError,
  AuthenticationError,
  NotFoundError,
  ValidationError
} from '@restoreassist/sdk';

try {
  const report = await client.reports.get('invalid-id');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.log('Please login first');
  } else if (error instanceof NotFoundError) {
    console.log('Report not found');
  } else if (error instanceof ValidationError) {
    console.log('Validation errors:', error.errors);
  } else if (error instanceof RestoreAssistError) {
    console.log('API error:', error.message);
    console.log('Status:', error.statusCode);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

---

## Types Reference

### Core Types

```typescript
type DamageType = 'water' | 'fire' | 'storm' | 'flood' | 'mold';
type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';
type UserRole = 'admin' | 'user' | 'viewer';
type ExportFormat = 'pdf' | 'docx';
```

### Report Item

```typescript
interface ReportItem {
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  category: string;
}
```

### Auth Tokens

```typescript
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}
```

For complete type definitions, see [types.ts](./src/types.ts).
