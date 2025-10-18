# RestoreAssist API Documentation

Complete REST API reference for the RestoreAssist backend server.

**Base URL**: `http://localhost:3001/api`

---

## 📋 Report Endpoints

### POST /api/reports
**Create a new damage assessment report** (AI-generated)

**Request Body**:
```json
{
  "propertyAddress": "123 Main St, Sydney NSW 2000",
  "damageType": "water",
  "damageDescription": "Burst pipe in ceiling caused water damage to living room",
  "state": "NSW",
  "clientName": "John Smith",
  "insuranceCompany": "NRMA Insurance",
  "claimNumber": "CLM-2024-12345"
}
```

**Response** (201 Created):
```json
{
  "reportId": "RPT-1697234567890-abc123",
  "timestamp": "2025-10-18T00:30:00.000Z",
  "propertyAddress": "123 Main St, Sydney NSW 2000",
  "damageType": "water",
  "state": "NSW",
  "summary": "Professional assessment summary...",
  "scopeOfWork": ["Step 1", "Step 2", ...],
  "itemizedEstimate": [
    {
      "description": "Emergency water extraction",
      "quantity": 1,
      "unitCost": 450.00,
      "totalCost": 450.00,
      "category": "Labor"
    }
  ],
  "totalCost": 8750.00,
  "complianceNotes": ["NCC 2022 compliance note..."],
  "authorityToProceed": "Professional ATP text...",
  "metadata": {
    "clientName": "John Smith",
    "insuranceCompany": "NRMA Insurance",
    "claimNumber": "CLM-2024-12345",
    "generatedBy": "RestoreAssist AI",
    "model": "claude-opus-4-20250514"
  }
}
```

---

### GET /api/reports
**List all reports** (paginated, sorted)

**Query Parameters**:
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10) - Items per page
- `sortBy` (string, default: "timestamp") - Sort field: `timestamp` | `totalCost`
- `order` (string, default: "desc") - Sort order: `asc` | `desc`

**Example**:
```bash
GET /api/reports?page=1&limit=20&sortBy=totalCost&order=desc
```

**Response** (200 OK):
```json
{
  "reports": [...],
  "total": 45,
  "page": 1,
  "totalPages": 3
}
```

---

### GET /api/reports/:id
**Get a single report by ID**

**Example**:
```bash
GET /api/reports/RPT-1697234567890-abc123
```

**Response** (200 OK): Full report object

**Response** (404 Not Found):
```json
{
  "error": "Report not found"
}
```

---

### PATCH /api/reports/:id
**Update an existing report**

**Request Body** (partial update):
```json
{
  "summary": "Updated summary text",
  "metadata": {
    "clientName": "Jane Smith"
  }
}
```

**Note**: Cannot update `reportId` or `timestamp` (protected fields)

**Response** (200 OK): Updated report object

---

### DELETE /api/reports/:id
**Delete a report**

**Response** (200 OK):
```json
{
  "message": "Report deleted successfully"
}
```

---

### GET /api/reports/stats
**Get report statistics**

**Response** (200 OK):
```json
{
  "totalReports": 125,
  "totalValue": 1250000.00,
  "averageValue": 10000.00,
  "byDamageType": {
    "water": 45,
    "fire": 30,
    "storm": 25,
    "flood": 15,
    "mold": 10
  },
  "byState": {
    "NSW": 50,
    "VIC": 35,
    "QLD": 20,
    "WA": 12,
    "SA": 8
  },
  "recentReports": 12
}
```

---

### DELETE /api/reports/cleanup/old
**Delete old reports**

**Query Parameters**:
- `days` (number, default: 30) - Delete reports older than X days

**Example**:
```bash
DELETE /api/reports/cleanup/old?days=90
```

**Response** (200 OK):
```json
{
  "message": "Deleted 15 reports older than 90 days",
  "deletedCount": 15,
  "days": 90
}
```

---

## 🔧 Admin Endpoints

### GET /api/admin/stats
**Get admin/system statistics**

**Response** (200 OK):
```json
{
  "totalReports": 125,
  "databaseSize": 125,
  "oldestReport": "2024-01-15T10:30:00.000Z",
  "newestReport": "2025-10-18T00:30:00.000Z",
  "uptime": "45 minutes",
  "memoryUsage": {
    "heapUsed": "25 MB",
    "heapTotal": "50 MB",
    "rss": "120 MB",
    "external": "5 MB"
  }
}
```

---

### POST /api/admin/cleanup
**Admin cleanup operations**

**Request Body** (Option 1 - Delete by age):
```json
{
  "days": 60
}
```

**Request Body** (Option 2 - Clear all):
```json
{
  "clearAll": true
}
```

**Response** (200 OK):
```json
{
  "message": "Deleted 25 reports older than 60 days",
  "deletedCount": 25,
  "days": 60
}
```

---

### GET /api/admin/health
**Comprehensive health check**

**Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-18T00:35:00.000Z",
  "environment": "development",
  "database": {
    "connected": true,
    "totalReports": 125,
    "size": 125
  },
  "system": {
    "uptime": 3600000,
    "memory": {
      "heapUsed": 25000000,
      "heapTotal": 50000000,
      "rss": 120000000
    },
    "nodeVersion": "v20.19.4",
    "platform": "win32"
  },
  "reports": {
    "total": 125,
    "recent24h": 12,
    "totalValue": 1250000.00,
    "averageValue": 10000.00
  }
}
```

**Response** (503 Service Unavailable) if unhealthy

---

## 🔍 Testing Examples

### Using cURL

```bash
# Health check
curl http://localhost:3001/api/health

# List reports (paginated)
curl "http://localhost:3001/api/reports?page=1&limit=10"

# Get statistics
curl http://localhost:3001/api/reports/stats

# Admin health check
curl http://localhost:3001/api/admin/health

# Create report
curl -X POST http://localhost:3001/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "propertyAddress": "123 Main St, Sydney NSW 2000",
    "damageType": "water",
    "damageDescription": "Burst pipe damage",
    "state": "NSW"
  }'

# Update report
curl -X PATCH http://localhost:3001/api/reports/RPT-123 \
  -H "Content-Type: application/json" \
  -d '{"summary": "Updated summary"}'

# Delete old reports
curl -X DELETE "http://localhost:3001/api/reports/cleanup/old?days=30"
```

---

## 📊 Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required fields: propertyAddress, damageType, damageDescription, state"
}
```

### 404 Not Found
```json
{
  "error": "Report not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to generate report",
  "message": "Detailed error message"
}
```

---

## 🔐 Authentication

Currently, the API is **open** (no authentication required).

**For production**, add authentication middleware:
- API Keys
- JWT tokens
- OAuth 2.0

---

## 📈 Rate Limiting

**Not implemented yet** - recommended for production:
- Limit: 100 requests per minute per IP
- Use `express-rate-limit` package

---

## 🗄️ Database

**Current**: In-memory storage (data lost on restart)

**Production**: Replace with:
- PostgreSQL
- MongoDB
- MySQL

Update `src/services/databaseService.ts` with real database connector.

---

## 🚀 Quick Start

```bash
# Start server
cd packages/backend
npm run dev

# Server runs on http://localhost:3001
# All endpoints available at /api/*
```
