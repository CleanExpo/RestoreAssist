# PostgreSQL Database Layer - Complete Implementation

RestoreAssist now supports **dual-mode database storage**: In-Memory (default) and PostgreSQL (production-ready).

---

## ✅ **WHAT'S BEEN IMPLEMENTED**

### **1. Database Migrations**
📁 [packages/backend/src/db/migrations/](packages/backend/src/db/migrations/)

- `001_create_reports.sql` - Main reports table with all fields
- `002_add_indexes.sql` - Performance indexes for queries
- `000_rollback.sql` - Rollback script (deletes all data)

**Features**:
- UUID primary keys
- Automatic timestamps (created_at, updated_at)
- JSONB columns for complex data
- Soft delete support (deleted_at)
- Full-text search index
- Comprehensive indexes for pagination, filtering, sorting

### **2. Connection Module**
📄 [packages/backend/src/db/connection.ts](packages/backend/src/db/connection.ts)

**Features**:
- `pg-promise` connection pooling (20 connections default)
- Automatic connection testing
- Health check monitoring
- Graceful shutdown support
- Environment-based configuration

### **3. Query Functions**
📄 [packages/backend/src/db/queries.ts](packages/backend/src/db/queries.ts)

**All CRUD Operations**:
- `createReport()` - Insert new report
- `findReportById()` - Get single report
- `findAllReports()` - Paginated list with sorting
- `updateReport()` - Partial updates
- `deleteReport()` - Soft delete
- `hardDeleteReport()` - Permanent delete
- `deleteOlderThan()` - Cleanup old reports

**Statistics**:
- `getStats()` - Report statistics
- `getAdminStats()` - System statistics
- `countReports()` - Count total reports

### **4. Dual-Mode Database Service**
📄 [packages/backend/src/services/databaseService.ts](packages/backend/src/services/databaseService.ts)

**Supports Both Modes**:
- **In-Memory**: Fast, no setup (default)
- **PostgreSQL**: Persistent, production-ready

**Switch via environment variable**: `USE_POSTGRES=true/false`

**API**:
- Synchronous methods (in-memory only)
- Async methods (both modes)
- Automatic mode detection
- Same interface for both implementations

---

## 🚀 **QUICK START**

### **Option 1: In-Memory Mode** (Default - No Setup)

```bash
# Already configured!
npm run dev
```

That's it! Server uses in-memory storage.

### **Option 2: PostgreSQL Mode** (Persistent Storage)

#### **Step 1: Install PostgreSQL**

**Windows**:
```bash
choco install postgresql
```

**macOS**:
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Linux**:
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

#### **Step 2: Create Database**

```bash
psql -U postgres
```

```sql
CREATE DATABASE restoreassist;
\q
```

#### **Step 3: Run Migrations**

```bash
cd packages/backend/src/db/migrations
psql -U postgres -d restoreassist -f 001_create_reports.sql
psql -U postgres -d restoreassist -f 002_add_indexes.sql
```

#### **Step 4: Enable PostgreSQL**

Edit `packages/backend/.env.local`:

```bash
USE_POSTGRES=true
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restoreassist
DB_USER=postgres
DB_PASSWORD=postgres
```

#### **Step 5: Restart Server**

```bash
npm run dev
```

You should see:
```
✅ Database connection successful
✅ Database initialized successfully
```

---

## 📊 **DATABASE SCHEMA**

### **reports Table**

```sql
CREATE TABLE reports (
    -- Identifiers
    report_id UUID PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,

    -- Property Info
    property_address TEXT NOT NULL,
    damage_type VARCHAR(50) CHECK (damage_type IN ('water', 'fire', 'storm', 'flood', 'mold')),
    damage_description TEXT NOT NULL,
    state VARCHAR(10) CHECK (state IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),

    -- Report Content
    summary TEXT NOT NULL,
    scope_of_work JSONB NOT NULL,
    itemized_estimate JSONB NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    compliance_notes JSONB NOT NULL,
    authority_to_proceed TEXT NOT NULL,

    -- Metadata
    client_name VARCHAR(255),
    insurance_company VARCHAR(255),
    claim_number VARCHAR(100),
    generated_by VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,

    -- Soft Delete
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

### **Indexes**

- `idx_reports_created_at` - Sort by date
- `idx_reports_state` - Filter by state
- `idx_reports_damage_type` - Filter by damage type
- `idx_reports_total_cost` - Sort by cost
- `idx_reports_fulltext_search` - Full-text search
- `idx_reports_pagination` - Efficient pagination
- ... and more (see migration files)

---

## 🔧 **API USAGE**

### **Synchronous API** (In-Memory Only)

```typescript
import { db } from './services/databaseService';

// Create
const report = db.create(newReport);

// Read
const report = db.findById('report-id');
const { reports, total } = db.findAll({ page: 1, limit: 10 });

// Update
const updated = db.update('report-id', { summary: 'New summary' });

// Delete
db.delete('report-id');
```

### **Async API** (Both Modes)

```typescript
import { db } from './services/databaseService';

// Create
const report = await db.createAsync(newReport);

// Read
const report = await db.findByIdAsync('report-id');
const { reports, total } = await db.findAllAsync({ page: 1, limit: 10 });

// Update
const updated = await db.updateAsync('report-id', { summary: 'New summary' });

// Delete
await db.deleteAsync('report-id');

// Statistics
const stats = await db.getStatsAsync();
const adminStats = await db.getAdminStatsAsync();
```

---

## 📁 **FILES CREATED**

### **Migrations**
1. [packages/backend/src/db/migrations/001_create_reports.sql](packages/backend/src/db/migrations/001_create_reports.sql)
2. [packages/backend/src/db/migrations/002_add_indexes.sql](packages/backend/src/db/migrations/002_add_indexes.sql)
3. [packages/backend/src/db/migrations/000_rollback.sql](packages/backend/src/db/migrations/000_rollback.sql)

### **Database Layer**
4. [packages/backend/src/db/connection.ts](packages/backend/src/db/connection.ts) - Connection pooling
5. [packages/backend/src/db/queries.ts](packages/backend/src/db/queries.ts) - All SQL queries
6. [packages/backend/src/db/README.md](packages/backend/src/db/README.md) - Complete setup guide

### **Service Layer**
7. [packages/backend/src/services/databaseService.ts](packages/backend/src/services/databaseService.ts) - Updated with dual-mode support

### **Configuration**
8. [packages/backend/.env.example](packages/backend/.env.example) - Updated with DB config
9. [packages/backend/.env.local](packages/backend/.env.local) - Updated with DB config

### **Documentation**
10. [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md) - This file

---

## 🎯 **ENVIRONMENT VARIABLES**

```bash
# Database Mode
USE_POSTGRES=false  # Set to "true" for PostgreSQL

# PostgreSQL Connection (only if USE_POSTGRES=true)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restoreassist
DB_USER=postgres
DB_PASSWORD=postgres
DB_POOL_SIZE=20
```

---

## 🔀 **SWITCHING MODES**

### **From In-Memory to PostgreSQL**

1. Set `USE_POSTGRES=true` in `.env.local`
2. Restart server
3. Data will now persist in PostgreSQL

⚠️ **Note**: Existing in-memory data is **NOT** automatically migrated!

### **From PostgreSQL to In-Memory**

1. Set `USE_POSTGRES=false` in `.env.local`
2. Restart server
3. Data will be stored in RAM (lost on restart)

---

## 📊 **MONITORING**

### **Health Check**

```bash
curl http://localhost:3001/api/admin/health
```

**Response**:
```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "totalReports": 125
  },
  "system": {
    "uptime": 3600000,
    "memory": {...}
  }
}
```

### **Statistics**

```bash
curl http://localhost:3001/api/reports/stats
```

**Response**:
```json
{
  "totalReports": 125,
  "totalValue": 1250000.00,
  "averageValue": 10000.00,
  "byDamageType": { "water": 45, "fire": 30 },
  "byState": { "NSW": 50, "VIC": 35 }
}
```

---

## 🚧 **PRODUCTION DEPLOYMENT**

### **Recommended Setup**

```bash
# Use PostgreSQL in production
USE_POSTGRES=true
NODE_ENV=production

# Use managed database service
DB_HOST=your-postgres-host.aws.com
DB_PORT=5432
DB_NAME=restoreassist_prod
DB_USER=restoreassist_user
DB_PASSWORD=strong_secure_password_here
DB_POOL_SIZE=50

# Enable SSL
DB_SSL=true
```

### **Managed Database Services**

- **AWS RDS** PostgreSQL
- **Azure Database** for PostgreSQL
- **Google Cloud SQL**
- **DigitalOcean** Managed Databases
- **Heroku Postgres**

---

## 🛠️ **TROUBLESHOOTING**

### **Connection Failed**

**Error**: `Database connection failed`

**Solution**:
1. Check PostgreSQL is running
2. Verify credentials in `.env.local`
3. Ensure database exists

### **Table Does Not Exist**

**Error**: `Reports table does not exist`

**Solution**: Run migrations:
```bash
psql -U postgres -d restoreassist -f src/db/migrations/001_create_reports.sql
```

### **Switch Back to In-Memory**

If PostgreSQL setup fails, you can always switch back:
```bash
USE_POSTGRES=false
```

---

## 📚 **DOCUMENTATION**

- **Setup Guide**: [packages/backend/src/db/README.md](packages/backend/src/db/README.md)
- **API Documentation**: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Migration Files**: [packages/backend/src/db/migrations/](packages/backend/src/db/migrations/)

---

## ✨ **SUMMARY**

✅ **PostgreSQL database layer fully implemented**
✅ **Dual-mode support** (in-memory + PostgreSQL)
✅ **Complete migrations** with indexes and constraints
✅ **Connection pooling** for performance
✅ **All CRUD operations** implemented
✅ **Statistics and admin endpoints** working
✅ **Production-ready** architecture
✅ **Easy switching** between modes
✅ **Comprehensive documentation**

**Current Status**: Running in **in-memory mode** (default).
**To enable PostgreSQL**: Set `USE_POSTGRES=true` and run migrations.

The backend now supports both development (fast in-memory) and production (persistent PostgreSQL) workflows! 🚀
