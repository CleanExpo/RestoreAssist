# Standards System - Implementation Plan

## Architecture Overview

```
Google Drive (IICRC Standards)
         ↓
Drive Resolver (fetch + parse)
         ↓
Supabase PostgreSQL (standards tables)
         ↓
RestoreAssist / Next.js (read live clauses)
```

---

## Phase 1: Database Setup ✅

- [x] Design Prisma schema for standards system
- [x] Create migration SQL file
- [ ] Run migration on Supabase

**Tables Created**:
- `Standard` - Standards metadata
- `StandardSection` - Hierarchical sections
- `StandardClause` - Individual clauses
- `SyncHistory` - Track sync jobs

---

## Phase 2: Drive Resolver Extension ✅

### 2.1 Document Parser Module ✅

**File**: `docker/drive-resolver/parser.py`

**Features** (All implemented):
- ✅ Parse PDF documents using pdfplumber
- ✅ Parse DOCX documents using python-docx
- ✅ Parse plain text documents
- ✅ Extract text by sections
- ✅ Identify clause numbers using regex (e.g., "3.2.1")
- ✅ Extract headings and structure hierarchically
- ✅ Infer category from content (Safety, Equipment, Documentation, etc.)
- ✅ Infer importance level (CRITICAL, REQUIRED, STANDARD, RECOMMENDED, OPTIONAL)
- ✅ Extract metadata (edition, year, publisher)

**Dependencies** (All installed):
- ✅ `pdfplumber==0.11.4` for PDF parsing
- ✅ `python-docx==1.1.2` for DOCX files
- ✅ `beautifulsoup4==4.12.3` for HTML parsing
- ✅ `lxml==5.3.0` for XML/HTML processing

### 2.2 Supabase Sync Module ✅

**File**: `docker/drive-resolver/sync_service.py`

**Features** (All implemented):
- ✅ Connect to Supabase via REST API or direct PostgreSQL
- ✅ Dual-mode support: Supabase client (supabase==2.24.0) or psycopg2 direct connection
- ✅ Upsert Standard records with Drive sync tracking
- ✅ Upsert StandardSection records with hierarchy support
- ✅ Upsert StandardClause records with importance/category
- ✅ Create SyncHistory records to track all operations
- ✅ Error handling with detailed error logging
- ✅ Transaction support with rollback capability
- ✅ Automatic standard code extraction from filename

### 2.3 New API Endpoints ✅

**Added to** `resolver.py`:

1. ✅ `POST /api/sync/standard/{fileId}` - Sync single standard document
   - Downloads file from Google Drive
   - Parses PDF/DOCX to extract structure
   - Syncs to Supabase database
   - Returns comprehensive statistics

2. ✅ `POST /api/sync/all` - Sync all standards from allowed folders
   - Iterates through all files in configured folders
   - Processes each file independently
   - Collects success/failure statistics
   - Returns aggregated summary

3. ✅ `GET /api/sync/status/{syncId}` - Check status of specific sync operation
   - Queries SyncHistory table
   - Returns detailed sync information
   - Includes error logs if available

4. ✅ `GET /api/sync/history` - View sync history with filters
   - Query parameters: limit, status, syncType
   - Returns chronological list of sync operations
   - Supports filtering by status and type

---

## Phase 3: Next.js Integration

### 3.1 API Routes

**File**: `app/api/standards/route.ts`
- `GET` - List all standards
- `POST` - Trigger sync (admin only)

**File**: `app/api/standards/[code]/route.ts`
- `GET` - Get standard details with clauses

**File**: `app/api/standards/[code]/clauses/route.ts`
- `GET` - Get all clauses for a standard
- Search/filter capabilities

**File**: `app/api/standards/search/route.ts`
- `POST` - Search clauses by keyword

### 3.2 Integration with Report Generation

**File**: `lib/standardsClient.ts`
- Utility functions to fetch relevant clauses
- Cache frequently used clauses
- Format clauses for report inclusion

**Modified**: `lib/reportGenerator.ts`
- Auto-include relevant IICRC clauses
- Reference standards in generated reports
- Add compliance checklist

---

## Phase 4: Admin UI

### 4.1 Standards Management Page

**File**: `app/admin/standards/page.tsx`

**Features**:
- View all synced standards
- Trigger manual sync
- View sync history
- View/edit clause metadata

**Components**:
- Standards list table
- Sync status dashboard
- Clause browser
- Search interface

---

## Phase 5: Testing

### 5.1 Integration Tests

1. **Parser Tests**:
   - Test PDF parsing
   - Test section extraction
   - Test clause identification

2. **Sync Tests**:
   - Test Supabase connection
   - Test data upsert
   - Test error handling

3. **API Tests**:
   - Test all new endpoints
   - Test authentication
   - Test rate limiting

4. **E2E Tests**:
   - Sync from Drive → Supabase
   - Read from Next.js
   - Include in generated report

---

## Implementation Steps

### Step 1: Install Dependencies (Drive Resolver)

```bash
cd docker/drive-resolver
```

Update `requirements.txt`:
```
google-api-python-client==2.150.0
google-auth==2.35.0
google-auth-httplib2==0.2.0
google-auth-oauthlib==1.2.1
flask==3.0.3
python-dotenv==1.0.1
requests==2.32.3
cachetools==5.5.0
pdfplumber==0.11.4
python-docx==1.1.2
beautifulsoup4==4.12.3
supabase==2.11.1
psycopg2-binary==2.9.10
```

### Step 2: Run Database Migration

```bash
# In Supabase SQL Editor, run:
cat prisma/migrations/add_standards_system.sql
```

### Step 3: Add Supabase Credentials

Add to `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...
```

### Step 4: Extend Drive Resolver

Create:
- `parser.py` - Document parsing logic
- `sync_service.py` - Supabase sync service
- Update `resolver.py` - Add sync endpoints

### Step 5: Create Next.js API Routes

Create:
- `app/api/standards/**` - All standard routes
- `lib/standardsClient.ts` - Client library

### Step 6: Update Report Generation

Modify:
- `lib/reportGenerator.ts` - Include standards
- Report prompts - Reference clauses

### Step 7: Create Admin UI

Create:
- `app/admin/standards/page.tsx` - Management UI

---

## Data Flow Example

### 1. Sync Process

```
1. Admin triggers sync via UI
   ↓
2. Next.js API calls Drive Resolver
   POST /api/sync/standard/{fileId}
   ↓
3. Drive Resolver:
   - Downloads file from Drive
   - Parses PDF/DOCX
   - Extracts standards/sections/clauses
   - Connects to Supabase
   - Upserts data
   - Records sync history
   ↓
4. Returns sync result to Next.js
   ↓
5. UI shows success/errors
```

### 2. Report Generation

```
1. User creates RestoreAssist report
   ↓
2. Report generator identifies hazard type
   (e.g., "Water Damage")
   ↓
3. Fetches relevant clauses:
   GET /api/standards/S500/clauses?category=Safety
   ↓
4. Includes clauses in generated report:
   "Per IICRC S500, Section 3.2.1..."
   ↓
5. Adds compliance checklist
```

---

## Configuration

### Environment Variables

**Drive Resolver** (`docker/drive-resolver/.env`):
```bash
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/drive_service_account.json
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
DATABASE_URL=postgresql://...
```

**Next.js** (`.env`):
```bash
DRIVE_RESOLVER_URL=http://localhost:5000
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
```

---

## File Structure

```
RestoreAssist/
├── docker/
│   └── drive-resolver/
│       ├── resolver.py           # Main service (extended)
│       ├── parser.py             # NEW: Document parser
│       ├── sync_service.py       # NEW: Supabase sync
│       ├── requirements.txt      # Updated dependencies
│       └── IMPLEMENTATION_PLAN.md # This file
├── prisma/
│   ├── schema.prisma             # Updated with standards models
│   └── migrations/
│       └── add_standards_system.sql # NEW: Migration SQL
├── app/
│   ├── api/
│   │   └── standards/            # NEW: Standards API routes
│   │       ├── route.ts
│   │       ├── [code]/
│   │       │   ├── route.ts
│   │       │   └── clauses/route.ts
│   │       ├── search/route.ts
│   │       └── sync/route.ts
│   └── admin/
│       └── standards/            # NEW: Admin UI
│           └── page.tsx
└── lib/
    ├── standardsClient.ts        # NEW: Standards utility
    └── reportGenerator.ts        # Modified: Include standards
```

---

## Next Steps

1. ✅ Install Python dependencies
2. ✅ Create parser.py
3. ✅ Create sync_service.py
4. ✅ Extend resolver.py with sync endpoints
5. ✅ Update Docker configuration and rebuild
6. ⏳ **NEXT: Run database migration on Supabase**
7. ⏳ Add Supabase credentials to Drive Resolver environment
8. ⏳ Test sync functionality end-to-end
9. ⏳ Create Next.js API routes (`app/api/standards/**`)
10. ⏳ Update report generator to include standards
11. ⏳ Create admin UI for standards management

---

## Phase 2 Completion Summary ✅

**Completed**: January 2025

**Files Created/Modified**:
- ✅ `docker/drive-resolver/parser.py` (371 lines) - Document parsing logic
- ✅ `docker/drive-resolver/sync_service.py` (543 lines) - Supabase sync service
- ✅ `docker/drive-resolver/resolver.py` - Extended with 4 new sync endpoints (270+ lines added)
- ✅ `docker/drive-resolver/requirements.txt` - Updated with parsing & DB dependencies
- ✅ `docker/drive-resolver/Dockerfile` - Updated to include new Python modules

**Dependencies Installed**:
- pdfplumber 0.11.4
- python-docx 1.1.2
- beautifulsoup4 4.12.3
- lxml 5.3.0
- supabase 2.24.0
- psycopg2-binary 2.9.10

**Docker Service**: ✅ Running and healthy at http://localhost:5000

**Next Phase**: Database migration and testing

---

**Status**: Phase 2 Complete ✅
**Phase 3 Estimated Time**: 3-4 hours
**Priority**: High
