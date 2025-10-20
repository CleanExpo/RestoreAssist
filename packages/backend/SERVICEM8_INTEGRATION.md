# ServiceM8 CRM Integration Documentation

## Overview

RestoreAssist integrates with ServiceM8 field service management platform, enabling seamless synchronisation of property damage assessment reports with ServiceM8 jobs. This integration allows restoration businesses to streamline their workflow by automatically updating job records with AI-generated assessment data.

## Features

- **Job Management** - Fetch, create, and update ServiceM8 jobs via API
- **Report Syncing** - Sync RestoreAssist reports to ServiceM8 jobs
- **Sync Tracking** - Track sync history and status for each report
- **Integration Statistics** - Monitor sync performance and success rates
- **Optional Configuration** - Enable/disable integration via environment variables

## Architecture

### Components

1. **servicem8Service.ts** - Core ServiceM8 API client and business logic
   - REST API communication with ServiceM8
   - Job CRUD operations
   - Report synchronisation logic
   - Sync record tracking

2. **integrationsRoutes.ts** - Integration API endpoints
   - List integrations
   - ServiceM8 job management
   - Sync operations
   - Statistics and monitoring

3. **integrations.ts** - TypeScript type definitions
   - ServiceM8 job types
   - Sync record types
   - Integration configuration types

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```bash
# ServiceM8 CRM Integration (optional - leave blank to disable)
SERVICEM8_API_KEY=your_api_key_here
SERVICEM8_DOMAIN=yourcompany
```

**Configuration Details:**

- **SERVICEM8_API_KEY** - Your ServiceM8 API key (required)
  - Get from ServiceM8: Settings → Developer → API Keys
  - Keep this secret and never commit to version control

- **SERVICEM8_DOMAIN** - Your ServiceM8 subdomain (required)
  - If your ServiceM8 URL is `https://acmerestoration.servicem8.com`
  - Then your domain is `acmerestoration`

**Important:**
- Leave both values empty to disable ServiceM8 integration
- Integration is optional and doesn't affect core RestoreAssist functionality
- The system will warn on startup if integration is not configured

## API Endpoints

All integration endpoints require authentication. Include the JWT access token in the Authorisation header:

```
Authorisation: Bearer <accessToken>
```

### List All Integrations

**GET /api/integrations**

List all available integrations and their status.

**Response:**
```json
{
  "integrations": [
    {
      "name": "ServiceM8",
      "id": "servicem8",
      "enabled": true,
      "connected": true,
      "description": "Field service management and CRM integration"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `500` - Server error

---

### Check ServiceM8 Status

**GET /api/integrations/servicem8/status**

Check if ServiceM8 integration is configured and test the connection.

**Response (Disabled):**
```json
{
  "enabled": false,
  "message": "ServiceM8 integration not configured"
}
```

**Response (Enabled & Connected):**
```json
{
  "enabled": true,
  "connected": true,
  "message": "ServiceM8 connection successful"
}
```

**Response (Enabled but Connection Failed):**
```json
{
  "enabled": true,
  "connected": false,
  "message": "ServiceM8 API error (401): Invalid API key"
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `500` - Server error

---

### List ServiceM8 Jobs

**GET /api/integrations/servicem8/jobs**

Fetch jobs from ServiceM8 with pagination and filtering.

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Jobs per page
- `status` (string, optional) - Filter by status (Quote, Approved, Work Order, In Progress, Completed, Cancelled)
- `search` (string, optional) - Search by address or description

**Example:**
```
GET /api/integrations/servicem8/jobs?page=1&limit=10&status=In%20Progress
```

**Response:**
```json
{
  "jobs": [
    {
      "uuid": "job-abc123",
      "job_address": "123 Main St, Sydney NSW 2000",
      "job_description": "Water damage restoration",
      "status": "In Progress",
      "contact_first": "John",
      "contact_last": "Smith",
      "contact_email": "john.smith@example.com",
      "contact_phone": "+61 400 123 456",
      "total_invoice_amount": 5000,
      "created_date": "2025-01-15T10:00:00Z",
      "updated_date": "2025-01-15T14:30:00Z",
      "custom_fields": {}
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `500` - Integration not configured or API error

---

### Get Single ServiceM8 Job

**GET /api/integrations/servicem8/jobs/:jobId**

Get a single job by its UUID.

**Response:**
```json
{
  "uuid": "job-abc123",
  "job_address": "123 Main St, Sydney NSW 2000",
  "job_description": "Water damage restoration",
  "status": "In Progress",
  "contact_first": "John",
  "contact_last": "Smith",
  "contact_email": "john.smith@example.com",
  "contact_phone": "+61 400 123 456",
  "total_invoice_amount": 5000,
  "created_date": "2025-01-15T10:00:00Z",
  "updated_date": "2025-01-15T14:30:00Z",
  "custom_fields": {}
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `404` - Job not found
- `500` - Integration error

---

### Create ServiceM8 Job

**POST /api/integrations/servicem8/jobs**

Create a new job in ServiceM8.

**Request:**
```json
{
  "job_address": "123 Main St, Sydney NSW 2000",
  "job_description": "Fire damage assessment required",
  "contact_first": "Jane",
  "contact_last": "Doe",
  "contact_email": "jane.doe@example.com",
  "contact_phone": "+61 400 987 654",
  "status": "Quote",
  "custom_fields": {
    "urgency": "high"
  }
}
```

**Response:**
```json
{
  "message": "Job created successfully",
  "job": {
    "uuid": "job-xyz789",
    "job_address": "123 Main St, Sydney NSW 2000",
    "job_description": "Fire damage assessment required",
    "status": "Quote",
    "contact_first": "Jane",
    "contact_last": "Doe",
    "contact_email": "jane.doe@example.com",
    "contact_phone": "+61 400 987 654",
    "created_date": "2025-01-16T09:00:00Z",
    "updated_date": "2025-01-16T09:00:00Z",
    "custom_fields": {
      "urgency": "high"
    }
  }
}
```

**Status Codes:**
- `201` - Job created
- `400` - Missing required fields
- `401` - Not authenticated
- `500` - Integration error

---

### Update ServiceM8 Job

**PUT /api/integrations/servicem8/jobs/:jobId**

Update an existing ServiceM8 job.

**Request:**
```json
{
  "status": "In Progress",
  "total_invoice_amount": 7500,
  "job_description": "Fire damage assessment - Updated scope"
}
```

**Response:**
```json
{
  "message": "Job updated successfully",
  "job": {
    "uuid": "job-xyz789",
    "job_address": "123 Main St, Sydney NSW 2000",
    "job_description": "Fire damage assessment - Updated scope",
    "status": "In Progress",
    "total_invoice_amount": 7500,
    "updated_date": "2025-01-16T10:30:00Z"
  }
}
```

**Status Codes:**
- `200` - Job updated
- `401` - Not authenticated
- `404` - Job not found
- `500` - Integration error

---

### Sync Report to ServiceM8 Job

**POST /api/integrations/servicem8/jobs/:jobId/sync**

Synchronise a RestoreAssist report to a ServiceM8 job. This updates the job with data from the assessment report.

**Request:**
```json
{
  "reportId": "report-1234567890",
  "syncFields": {
    "description": true,
    "address": true,
    "cost": true,
    "customFields": true
  }
}
```

**Request Fields:**
- `reportId` (string, required) - ID of the RestoreAssist report to sync
- `syncFields` (object, optional) - Control which fields to sync
  - `description` (boolean, default: true) - Sync job description with report summary
  - `address` (boolean, default: true) - Sync job address with property address
  - `cost` (boolean, default: true) - Sync total invoice amount with estimated cost
  - `customFields` (boolean, default: true) - Sync custom fields (damage type, severity, etc.)

**Response (Success):**
```json
{
  "message": "Report synced to ServiceM8 job successfully",
  "syncRecord": {
    "syncId": "sync-1760750400-abc123",
    "reportId": "report-1234567890",
    "serviceM8JobId": "job-xyz789",
    "status": "synced",
    "lastSyncAt": "2025-01-16T11:00:00Z",
    "createdAt": "2025-01-16T11:00:00Z",
    "updatedAt": "2025-01-16T11:00:00Z"
  },
  "updatedJob": {
    "uuid": "job-xyz789",
    "job_address": "123 Main St, Sydney NSW 2000",
    "job_description": "Property Damage Assessment - Fire\n\nSeverity: High\nUrgent: Yes\n\nSummary:\nExtensive fire damage to residential property...",
    "total_invoice_amount": 85000,
    "custom_fields": {
      "restore_assist_report_id": "report-1234567890",
      "damage_type": "Fire",
      "severity": "High",
      "urgent": true,
      "state": "NSW",
      "generated_at": "2025-01-16T10:30:00Z"
    }
  }
}
```

**Response (Failed):**
```json
{
  "error": "Sync failed",
  "message": "Sync failed: ServiceM8 API error (404): Job not found",
  "syncRecord": {
    "syncId": "sync-1760750400-abc123",
    "reportId": "report-1234567890",
    "serviceM8JobId": "job-invalid",
    "status": "failed",
    "errorMessage": "ServiceM8 API error (404): Job not found",
    "createdAt": "2025-01-16T11:00:00Z",
    "updatedAt": "2025-01-16T11:00:00Z"
  }
}
```

**Status Codes:**
- `200` - Sync successful
- `400` - Missing reportId
- `401` - Not authenticated
- `404` - Report not found
- `500` - Sync failed

---

### Get Sync Record

**GET /api/integrations/servicem8/sync/:syncId**

Get a sync record by its ID.

**Response:**
```json
{
  "syncId": "sync-1760750400-abc123",
  "reportId": "report-1234567890",
  "serviceM8JobId": "job-xyz789",
  "status": "synced",
  "lastSyncAt": "2025-01-16T11:00:00Z",
  "createdAt": "2025-01-16T11:00:00Z",
  "updatedAt": "2025-01-16T11:00:00Z",
  "syncData": {
    "reportSnapshot": { },
    "jobSnapshot": { }
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `404` - Sync record not found
- `500` - Server error

---

### Get Sync Records for Report

**GET /api/integrations/servicem8/sync/report/:reportId**

Get all sync records for a specific report (sorted by most recent first).

**Response:**
```json
{
  "reportId": "report-1234567890",
  "syncRecords": [
    {
      "syncId": "sync-1760750400-abc123",
      "reportId": "report-1234567890",
      "serviceM8JobId": "job-xyz789",
      "status": "synced",
      "lastSyncAt": "2025-01-16T11:00:00Z",
      "createdAt": "2025-01-16T11:00:00Z",
      "updatedAt": "2025-01-16T11:00:00Z"
    }
  ],
  "count": 1
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `500` - Server error

---

### Get Integration Statistics

**GET /api/integrations/servicem8/stats**

Get ServiceM8 integration statistics.

**Response:**
```json
{
  "servicem8": {
    "totalSyncs": 150,
    "successfulSyncs": 145,
    "failedSyncs": 5,
    "lastSyncAt": "2025-01-16T11:00:00Z",
    "connectedJobs": 42
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `500` - Server error

---

### Clear Sync Records (Admin Only)

**DELETE /api/integrations/servicem8/sync**

Clear all sync records. Useful for testing and development.

**Response:**
```json
{
  "message": "All sync records cleared successfully"
}
```

**Status Codes:**
- `200` - Success
- `401` - Not authenticated
- `403` - Not authorised (requires admin role)
- `500` - Server error

---

## Usage Examples

### 1. Check Integration Status

```javascript
const accessToken = localStorage.getItem('accessToken');

const statusResponse = await fetch('http://localhost:3001/api/integrations/servicem8/status', {
  headers: {
    'Authorisation': `Bearer ${accessToken}`
  }
});

const status = await statusResponse.json();

if (status.enabled && status.connected) {
  console.log('ServiceM8 integration is active');
} else {
  console.log('ServiceM8 not configured or connection failed');
}
```

### 2. Fetch ServiceM8 Jobs

```javascript
const accessToken = localStorage.getItem('accessToken');

const jobsResponse = await fetch(
  'http://localhost:3001/api/integrations/servicem8/jobs?status=In%20Progress&limit=20',
  {
    headers: {
      'Authorisation': `Bearer ${accessToken}`
    }
  }
);

const { jobs, total } = await jobsResponse.json();
console.log(`Found ${total} jobs in progress`);
```

### 3. Sync Report to Job

```javascript
const accessToken = localStorage.getItem('accessToken');
const reportId = 'report-1234567890';
const jobId = 'job-xyz789';

const syncResponse = await fetch(
  `http://localhost:3001/api/integrations/servicem8/jobs/${jobId}/sync`,
  {
    method: 'POST',
    headers: {
      'Authorisation': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reportId,
      syncFields: {
        description: true,
        address: true,
        cost: true,
        customFields: true
      }
    })
  }
);

const result = await syncResponse.json();

if (result.syncRecord.status === 'synced') {
  console.log('Report synced successfully!');
  console.log('Updated job:', result.updatedJob);
} else {
  console.error('Sync failed:', result.syncRecord.errorMessage);
}
```

### 4. Create ServiceM8 Job from Report

```javascript
const accessToken = localStorage.getItem('accessToken');
const report = {
  propertyAddress: '123 Main St, Sydney NSW 2000',
  damageType: 'Water',
  clientName: 'John Smith',
  clientEmail: 'john@example.com',
  clientPhone: '+61 400 123 456'
};

// Create job
const createResponse = await fetch(
  'http://localhost:3001/api/integrations/servicem8/jobs',
  {
    method: 'POST',
    headers: {
      'Authorisation': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      job_address: report.propertyAddress,
      job_description: `${report.damageType} damage assessment`,
      contact_first: report.clientName.split(' ')[0],
      contact_last: report.clientName.split(' ')[1] || '',
      contact_email: report.clientEmail,
      contact_phone: report.clientPhone,
      status: 'Quote'
    })
  }
);

const { job } = await createResponse.json();
console.log('Created job:', job.uuid);

// Then sync the report
const syncResponse = await fetch(
  `http://localhost:3001/api/integrations/servicem8/jobs/${job.uuid}/sync`,
  {
    method: 'POST',
    headers: {
      'Authorisation': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reportId: report.reportId
    })
  }
);
```

### 5. Monitor Sync History

```javascript
const accessToken = localStorage.getItem('accessToken');
const reportId = 'report-1234567890';

const historyResponse = await fetch(
  `http://localhost:3001/api/integrations/servicem8/sync/report/${reportId}`,
  {
    headers: {
      'Authorisation': `Bearer ${accessToken}`
    }
  }
);

const { syncRecords } = await historyResponse.json();

syncRecords.forEach(record => {
  console.log(`Sync ${record.syncId}:`);
  console.log(`  Status: ${record.status}`);
  console.log(`  Job: ${record.serviceM8JobId}`);
  console.log(`  Date: ${new Date(record.createdAt).toLocaleString()}`);
  if (record.errorMessage) {
    console.log(`  Error: ${record.errorMessage}`);
  }
});
```

## Testing with cURL

### Check Status
```bash
curl http://localhost:3001/api/integrations/servicem8/status \
  -H "Authorisation: Bearer YOUR_ACCESS_TOKEN"
```

### List Jobs
```bash
curl "http://localhost:3001/api/integrations/servicem8/jobs?page=1&limit=10" \
  -H "Authorisation: Bearer YOUR_ACCESS_TOKEN"
```

### Sync Report to Job
```bash
curl -X POST http://localhost:3001/api/integrations/servicem8/jobs/JOB_ID/sync \
  -H "Authorisation: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "report-1234567890",
    "syncFields": {
      "description": true,
      "address": true,
      "cost": true,
      "customFields": true
    }
  }'
```

### Get Stats
```bash
curl http://localhost:3001/api/integrations/servicem8/stats \
  -H "Authorisation: Bearer YOUR_ACCESS_TOKEN"
```

## Sync Field Mapping

When syncing a RestoreAssist report to a ServiceM8 job, the following field mappings are used:

| RestoreAssist Report | ServiceM8 Job Field | Description |
|---------------------|---------------------|-------------|
| `propertyAddress` | `job_address` | Property location |
| `summary` + `recommendations` | `job_description` | Formatted assessment details |
| `totalCost` | `total_invoice_amount` | Estimated repair cost |
| `reportId` | `custom_fields.restore_assist_report_id` | Link back to report |
| `damageType` | `custom_fields.damage_type` | Type of damage |
| `severity` | `custom_fields.severity` | Severity rating |
| `urgent` | `custom_fields.urgent` | Urgency flag |
| `state` | `custom_fields.state` | Australian state |
| `timestamp` | `custom_fields.generated_at` | Report generation time |

## Job Description Format

When syncing, the job description is formatted as:

```
Property Damage Assessment - [Damage Type]

Severity: [High/Medium/Low]
Urgent: [Yes/No]

Summary:
[Report summary text]

Recommendations:
1. [Recommendation 1]
2. [Recommendation 2]
...

Total Estimated Cost: $XX,XXX

Generated: [Date and time]
Report ID: [report-id]
```

## Error Handling

### Common Errors

**Integration Not Configured**
```json
{
  "error": "Failed to fetch ServiceM8 jobs",
  "message": "ServiceM8 integration not configured"
}
```
**Solution:** Configure `SERVICEM8_API_KEY` and `SERVICEM8_DOMAIN` in `.env.local`

**Invalid API Key**
```json
{
  "enabled": true,
  "connected": false,
  "message": "ServiceM8 API error (401): Unauthorized"
}
```
**Solution:** Verify your API key in ServiceM8 settings

**Report Not Found**
```json
{
  "error": "Report not found",
  "message": "No report found with ID: report-invalid"
}
```
**Solution:** Ensure the reportId exists in RestoreAssist

**Job Not Found**
```json
{
  "error": "Failed to fetch ServiceM8 job",
  "message": "ServiceM8 API error (404): Job not found"
}
```
**Solution:** Verify the job UUID exists in ServiceM8

## Security

- All integration endpoints require JWT authentication
- API keys are stored as environment variables (never in code)
- Sync records include snapshots for audit trail
- Admin-only endpoints for destructive operations

## Storage

Currently, sync records are stored in-memory. For production:

1. Create database table for sync records:
```sql
CREATE TABLE integration_sync_records (
  sync_id VARCHAR(255) PRIMARY KEY,
  report_id VARCHAR(255) NOT NULL,
  service_m8_job_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  last_sync_at TIMESTAMP,
  error_message TEXT,
  sync_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(report_id)
);

CREATE INDEX idx_sync_report_id ON integration_sync_records(report_id);
CREATE INDEX idx_sync_job_id ON integration_sync_records(service_m8_job_id);
CREATE INDEX idx_sync_status ON integration_sync_records(status);
```

2. Update `servicem8Service.ts` to use database instead of Map

## Future Enhancements

- Webhooks for bidirectional sync (ServiceM8 → RestoreAssist)
- Automatic sync on report generation
- Batch sync operations
- Conflict resolution for simultaneous updates
- Additional field mappings (photos, contacts, notes)
- Support for other CRM platforms (Xero, MYOB, etc.)

## Troubleshooting

**Integration shows as disabled**
- Check `.env.local` has `SERVICEM8_API_KEY` and `SERVICEM8_DOMAIN`
- Restart backend server after updating environment variables

**Connection test fails**
- Verify API key is correct
- Check domain name matches your ServiceM8 URL
- Ensure ServiceM8 API access is enabled in your account

**Sync fails**
- Check job UUID is valid in ServiceM8
- Verify report exists in RestoreAssist
- Review sync record error message for details
- Check ServiceM8 API rate limits

**Jobs not appearing**
- Verify jobs exist in ServiceM8
- Check status filter matches your jobs
- Ensure API key has permission to view jobs

## Support

For ServiceM8 API documentation, visit:
https://developer.servicem8.com/docs/rest-api

For RestoreAssist integration issues, check:
- Server logs for detailed error messages
- Integration stats endpoint for sync success rates
- Sync history for individual reports
