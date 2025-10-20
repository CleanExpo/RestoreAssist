# RestoreAssist SDK

Official TypeScript/JavaScript SDK for the RestoreAssist API - AI-powered disaster restoration damage assessment platform.

## Installation

```bash
npm install @restoreassist/sdk
# or
yarn add @restoreassist/sdk
# or
pnpm add @restoreassist/sdk
```

## Quick Start

```typescript
import { RestoreAssistClient } from '@restoreassist/sdk';

// Initialise the client
const client = new RestoreAssistClient({
  baseUrl: 'http://localhost:3001/api',
  // Optional: provide credentials for automatic login
  credentials: {
    email: 'user@example.com',
    password: 'password123'
  }
});

// Or authenticate manually
await client.auth.login({
  email: 'user@example.com',
  password: 'password123'
});

// Generate a damage assessment report
const report = await client.reports.generate({
  propertyAddress: '123 Main St, Sydney NSW 2000',
  damageType: 'water',
  damageDescription: 'Burst pipe in upstairs bathroom causing water damage to ceiling and walls',
  state: 'NSW',
  clientName: 'John Smith',
  insuranceCompany: 'ABC Insurance',
  claimNumber: 'CLM-12345'
});

console.log('Report generated:', report.reportId);
console.log('Total cost:', report.totalCost);

// Get reports with pagination
const { reports, total, page, totalPages } = await client.reports.list({
  page: 1,
  limit: 10,
  sortBy: 'timestamp',
  order: 'desc'
});

// Get a specific report
const specificReport = await client.reports.get(report.reportId);

// Export report to PDF or DOCX
const exportResult = await client.reports.export(report.reportId, {
  format: 'pdf',
  includeCharts: true,
  includeBranding: true
});

// Download the exported file
const blob = await client.exports.download(exportResult.fileName);

// Get statistics
const stats = await client.reports.getStats();
console.log('Total reports:', stats.totalReports);
console.log('Total value:', stats.totalValue);
```

## Features

- **Type-safe** - Full TypeScript support with comprehensive type definitions
- **Authentication** - Built-in JWT token management with automatic refresh
- **Reports** - Generate, list, update, delete damage assessment reports
- **Exports** - Export reports to PDF/DOCX formats
- **Statistics** - Get analytics and insights
- **Admin** - Admin operations and system health checks
- **Integrations** - ServiceM8 and Google Drive integrations
- **Error handling** - Comprehensive error types and handling

## API Reference

### RestoreAssistClient

Main client class for interacting with the RestoreAssist API.

```typescript
const client = new RestoreAssistClient(config: ClientConfig);
```

#### Configuration Options

```typescript
interface ClientConfig {
  baseUrl: string;                    // API base URL (default: 'http://localhost:3001/api')
  credentials?: {                     // Optional auto-login credentials
    email: string;
    password: string;
  };
  onTokenRefresh?: (tokens: AuthTokens) => void;  // Token refresh callback
  onError?: (error: RestoreAssistError) => void;  // Global error handler
}
```

### Authentication API

```typescript
// Login
const { user, tokens } = await client.auth.login({
  email: 'user@example.com',
  password: 'password123'
});

// Logout
await client.auth.logout();

// Get current user
const user = await client.auth.getCurrentUser();

// Refresh token
const tokens = await client.auth.refreshToken();

// Change password
await client.auth.changePassword({
  currentPassword: 'old',
  newPassword: 'new'
});

// Register user (admin only)
const newUser = await client.auth.register({
  email: 'newuser@example.com',
  password: 'password',
  name: 'New User',
  role: 'user',
  company: 'Company Name'
});

// List users (admin only)
const users = await client.auth.listUsers();

// Delete user (admin only)
await client.auth.deleteUser('userId');
```

### Reports API

```typescript
// Generate report
const report = await client.reports.generate({
  propertyAddress: string;
  damageType: 'water' | 'fire' | 'storm' | 'flood' | 'mold';
  damageDescription: string;
  state: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';
  clientName?: string;
  insuranceCompany?: string;
  claimNumber?: string;
});

// List reports (paginated)
const result = await client.reports.list({
  page?: number;           // Default: 1
  limit?: number;          // Default: 10
  sortBy?: 'timestamp' | 'totalCost';  // Default: 'timestamp'
  order?: 'asc' | 'desc';  // Default: 'desc'
});

// Get single report
const report = await client.reports.get(reportId);

// Update report
const updated = await client.reports.update(reportId, {
  summary?: string;
  scopeOfWork?: string[];
  itemizedEstimate?: ReportItem[];
  // ... other fields
});

// Delete report
await client.reports.delete(reportId);

// Export report
const result = await client.reports.export(reportId, {
  format: 'pdf' | 'docx';
  email?: string;          // Optional: send via email
  includeCharts?: boolean;
  includeBranding?: boolean;
});

// Get statistics
const stats = await client.reports.getStats();
```

### Exports API

```typescript
// Download exported file
const blob = await client.exports.download(fileName);
```

### Admin API

```typescript
// Get admin statistics
const stats = await client.admin.getStats();

// Cleanup old reports (admin only)
const result = await client.admin.cleanup({ days: 30 });

// Health check
const health = await client.admin.health();
```

### Integrations API

```typescript
// List all integrations
const integrations = await client.integrations.list();

// ServiceM8
const servicem8Status = await client.integrations.servicem8.getStatus();
const jobs = await client.integrations.servicem8.listJobs();
await client.integrations.servicem8.syncReport(jobId, reportId);
const stats = await client.integrations.servicem8.getStats();

// Google Drive
const driveStatus = await client.integrations.googleDrive.getStatus();
const authUrl = await client.integrations.googleDrive.getAuthUrl();
await client.integrations.googleDrive.saveReport(reportId);
const files = await client.integrations.googleDrive.listFiles();
const stats = await client.integrations.googleDrive.getStats();
```

## Error Handling

The SDK provides comprehensive error handling:

```typescript
import { RestoreAssistError, AuthenticationError, NotFoundError } from '@restoreassist/sdk';

try {
  const report = await client.reports.get('invalid-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Report not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Authentication failed, please login');
  } else if (error instanceof RestoreAssistError) {
    console.log('API error:', error.message);
    console.log('Status code:', error.statusCode);
  }
}
```

## TypeScript Types

All types are exported and available for use:

```typescript
import type {
  GeneratedReport,
  GenerateReportRequest,
  ReportItem,
  DamageType,
  AustralianState,
  User,
  UserRole,
  AuthTokens,
  ExportOptions,
  ExportResult,
  Statistics,
  PaginatedResponse
} from '@restoreassist/sdk';
```

## Examples

### Complete Example with Error Handling

```typescript
import { RestoreAssistClient, RestoreAssistError } from '@restoreassist/sdk';

async function main() {
  const client = new RestoreAssistClient({
    baseUrl: 'http://localhost:3001/api',
    onError: (error) => {
      console.error('SDK Error:', error.message);
    }
  });

  try {
    // Login
    await client.auth.login({
      email: 'demo@restoreassist.com',
      password: 'demo123'
    });

    // Generate report
    const report = await client.reports.generate({
      propertyAddress: '456 Example St, Melbourne VIC 3000',
      damageType: 'fire',
      damageDescription: 'Kitchen fire caused by electrical fault',
      state: 'VIC',
      clientName: 'Jane Doe',
      insuranceCompany: 'XYZ Insurance',
      claimNumber: 'FIRE-2024-001'
    });

    console.log('Generated report:', report.reportId);
    console.log('Total cost: $' + report.totalCost.toFixed(2));

    // Export to PDF
    const exportResult = await client.reports.export(report.reportId, {
      format: 'pdf',
      includeCharts: true,
      includeBranding: true
    });

    console.log('Export complete:', exportResult.fileName);

    // Get statistics
    const stats = await client.reports.getStats();
    console.log('Statistics:', stats);

  } catch (error) {
    if (error instanceof RestoreAssistError) {
      console.error('Error:', error.message);
      console.error('Status:', error.statusCode);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

main();
```

### Batch Report Generation

```typescript
async function generateMultipleReports() {
  const client = new RestoreAssistClient({
    baseUrl: 'http://localhost:3001/api',
    credentials: {
      email: 'admin@restoreassist.com',
      password: 'admin123'
    }
  });

  const properties = [
    {
      propertyAddress: '123 Water St, Sydney NSW 2000',
      damageType: 'water' as const,
      damageDescription: 'Burst pipe',
      state: 'NSW' as const
    },
    {
      propertyAddress: '456 Fire Ave, Brisbane QLD 4000',
      damageType: 'fire' as const,
      damageDescription: 'Electrical fire',
      state: 'QLD' as const
    }
  ];

  const reports = await Promise.all(
    properties.map(property => client.reports.generate(property))
  );

  console.log(`Generated ${reports.length} reports`);
  return reports;
}
```

## License

MIT
