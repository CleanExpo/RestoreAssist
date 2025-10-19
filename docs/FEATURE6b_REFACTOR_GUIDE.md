# Feature 6b: Database Refactoring Guide

**Issue**: AscoraIntegrationService and ascoraRoutes use PostgreSQL `Pool` from 'pg', but the existing RestoreAssist codebase uses `pg-promise` with a different API.

**Status**: Code Complete - Pending Database Pattern Alignment

---

## Technical Analysis

### Current Pattern (Existing Codebase)

**File**: `packages/backend/src/db/connection.ts`
```typescript
import pgPromise from 'pg-promise';

const pgp = pgPromise({ capSQL: true });
export const db = pgp(dbConfig);

// Usage in queries.ts:
const result = await db.any('SELECT * FROM reports WHERE id = $1', [id]);
const one = await db.one('SELECT 1 as test');
const none = await db.none('INSERT INTO...');
```

**API Methods**:
- `db.any(sql, values)` - Returns array of rows
- `db.one(sql, values)` - Returns single row
- `db.oneOrNone(sql, values)` - Returns row or null
- `db.none(sql, values)` - No return value
- `db.query(sql, values)` - Generic query

### Ascora Pattern (New Code)

**File**: `packages/backend/src/services/AscoraIntegrationService.ts`
```typescript
import { Pool } from 'pg';

constructor(db: Pool) {
  this.db = db;
}

// Usage:
const result = await this.db.query('SELECT * FROM...', [params]);
// result.rows contains the data
```

**API Methods**:
- `pool.query(sql, values)` - Returns `{ rows: [], rowCount: number }`

---

## Solution Options

### Option 1: Adapt Ascora Code to pg-promise ✅ RECOMMENDED

**Pros**:
- Consistent with existing codebase
- No breaking changes
- Uses established pattern

**Cons**:
- Requires refactoring Ascora code (~100 db calls)

**Implementation**:
1. Change `AscoraIntegrationService` constructor to not require Pool
2. Import `db` from `../db/connection`
3. Replace all `this.db.query()` calls with appropriate pg-promise methods
4. Update return value handling (`result.rows` → `result`)

**Example Refactor**:
```typescript
// Before (pg Pool):
const result = await this.db.query(
  'SELECT * FROM ascora_integrations WHERE id = $1',
  [id]
);
if (result.rows.length === 0) return null;
return result.rows[0];

// After (pg-promise):
const result = await db.oneOrNone(
  'SELECT * FROM ascora_integrations WHERE id = $1',
  [id]
);
return result;
```

### Option 2: Create pg Pool Alongside pg-promise

**Pros**:
- Minimal code changes
- Ascora code works as-is

**Cons**:
- Two database connection pools
- Increased complexity
- Resource overhead

**Not Recommended** - Adds unnecessary complexity

### Option 3: Migrate Entire Codebase to pg Pool

**Pros**:
- Standardizes on one library
- Native PostgreSQL driver

**Cons**:
- Large refactor (entire codebase)
- Risk of breaking changes
- Time-consuming

**Not Recommended** - Out of scope

---

## Recommended Implementation Plan

### Step 1: Update AscoraIntegrationService Constructor

**File**: `packages/backend/src/services/AscoraIntegrationService.ts`

**Current**:
```typescript
import { Pool } from 'pg';

export class AscoraIntegrationService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }
}
```

**Updated**:
```typescript
import { db } from '../db/connection';

export class AscoraIntegrationService {
  private db = db; // Use imported db instance
  private clients: Map<string, AscoraApiClient> = new Map();

  // Remove constructor or make it parameter-less
  constructor() {
    // No params needed
  }
}
```

### Step 2: Update Database Queries

Replace all instances of:
```typescript
const result = await this.db.query(sql, params);
// Access: result.rows[0], result.rows.length
```

With pg-promise equivalents:
```typescript
// For SELECT expecting multiple rows:
const result = await this.db.any(sql, params);
// Access: result[0], result.length

// For SELECT expecting single row:
const result = await this.db.one(sql, params);
// Access: result.column_name

// For SELECT that might return 0 or 1 row:
const result = await this.db.oneOrNone(sql, params);
// Access: result?.column_name

// For INSERT/UPDATE/DELETE:
await this.db.none(sql, params);
```

### Step 3: Update ascoraRoutes.ts

**File**: `packages/backend/src/routes/ascoraRoutes.ts`

**Current**:
```typescript
import { Pool } from 'pg';
import AscoraIntegrationService from '../services/AscoraIntegrationService';

let ascoraService: AscoraIntegrationService;

export const initializeAscoraRoutes = (db: Pool) => {
  ascoraService = new AscoraIntegrationService(db);
  return router;
};
```

**Updated**:
```typescript
import express from 'express';
import AscoraIntegrationService from '../services/AscoraIntegrationService';
import { body, param, query, validationResult } from 'express-validator';

const router = express.Router();
const ascoraService = new AscoraIntegrationService();

// Remove initializeAscoraRoutes function
// Routes stay the same...

export { router as ascoraRoutes };
```

### Step 4: Update index.ts

**File**: `packages/backend/src/index.ts`

**Uncomment** the imports and route registration:
```typescript
import { ascoraRoutes } from './routes/ascoraRoutes';

app.use('/api/organizations/:orgId/ascora', ascoraRoutes);
```

---

## Query Conversion Reference

### SELECT Queries

| Operation | pg Pool | pg-promise |
|-----------|---------|------------|
| Multiple rows | `const res = await pool.query(sql); res.rows` | `const rows = await db.any(sql)` |
| Single row (must exist) | `const res = await pool.query(sql); res.rows[0]` | `const row = await db.one(sql)` |
| Single row (optional) | `const res = await pool.query(sql); res.rows[0] \|\| null` | `const row = await db.oneOrNone(sql)` |
| Count | `const res = await pool.query('SELECT COUNT(*)'); res.rows[0].count` | `const count = await db.one('SELECT COUNT(*)', [], r => +r.count)` |

### INSERT/UPDATE/DELETE

| Operation | pg Pool | pg-promise |
|-----------|---------|------------|
| No return | `await pool.query(sql, params)` | `await db.none(sql, params)` |
| With RETURNING | `const res = await pool.query(sql + ' RETURNING *'); res.rows[0]` | `const row = await db.one(sql + ' RETURNING *', params)` |

### Specific Examples from Ascora Code

#### Example 1: Get Integration
```typescript
// Before:
const result = await this.db.query(
  `SELECT * FROM ascora_integrations WHERE organization_id = $1 AND is_active = true`,
  [organizationId]
);
if (result.rows.length === 0) return null;
return this.mapIntegrationFromDb(result.rows[0]);

// After:
const result = await this.db.oneOrNone(
  `SELECT * FROM ascora_integrations WHERE organization_id = $1 AND is_active = true`,
  [organizationId]
);
if (!result) return null;
return this.mapIntegrationFromDb(result);
```

#### Example 2: Insert with RETURNING
```typescript
// Before:
const result = await this.db.query(
  `INSERT INTO ascora_integrations (...) VALUES (...) RETURNING *`,
  [params]
);
return this.mapIntegrationFromDb(result.rows[0]);

// After:
const result = await this.db.one(
  `INSERT INTO ascora_integrations (...) VALUES (...) RETURNING *`,
  [params]
);
return this.mapIntegrationFromDb(result);
```

#### Example 3: Update
```typescript
// Before:
await this.db.query(
  `UPDATE ascora_integrations SET is_active = false WHERE organization_id = $1`,
  [organizationId]
);

// After:
await this.db.none(
  `UPDATE ascora_integrations SET is_active = false WHERE organization_id = $1`,
  [organizationId]
);
```

#### Example 4: Count
```typescript
// Before:
const countResult = await this.db.query(
  `SELECT COUNT(*) FROM ascora_customers WHERE organization_id = $1`,
  [organizationId]
);
const total = parseInt(countResult.rows[0].count);

// After:
const total = await this.db.one(
  `SELECT COUNT(*) as count FROM ascora_customers WHERE organization_id = $1`,
  [organizationId],
  row => parseInt(row.count)
);
```

---

## Files Requiring Changes

### Priority 1 - Essential
1. `packages/backend/src/services/AscoraIntegrationService.ts` (~100 query calls to update)
2. `packages/backend/src/routes/ascoraRoutes.ts` (~40 query calls to update)
3. `packages/backend/src/index.ts` (uncomment imports)

### Priority 2 - Testing
4. Unit tests (once created)
5. Integration tests (once created)

---

## Estimated Effort

- **AscoraIntegrationService refactor**: 2-3 hours
- **ascoraRoutes refactor**: 1-2 hours
- **Testing**: 1 hour
- **Total**: 4-6 hours

---

## Alternative: Quick Wrapper (Temporary Solution)

If immediate testing is needed, create a wrapper:

```typescript
// packages/backend/src/db/poolWrapper.ts
import { db as pgpDb } from './connection';
import { Pool, QueryResult } from 'pg';

export class PgPromisePoolWrapper {
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const rows = await pgpDb.any(sql, params);
    return {
      rows,
      rowCount: rows.length,
      command: '',
      oid: 0,
      fields: []
    } as QueryResult;
  }
}

export const poolWrapper = new PgPromisePoolWrapper();
```

Then use:
```typescript
// AscoraIntegrationService.ts
import { poolWrapper } from '../db/poolWrapper';

constructor() {
  this.db = poolWrapper as any; // Type cast
}
```

**Note**: This is a temporary workaround. Full refactor is recommended for production.

---

## Testing Plan

After refactoring:

1. **Unit Tests**:
   - Test each database query in isolation
   - Mock pg-promise db object
   - Verify correct method calls

2. **Integration Tests**:
   - Connect to test database
   - Run actual queries
   - Verify data integrity

3. **Manual Testing**:
   - Test connection endpoint
   - Test job creation
   - Test customer sync
   - Test invoice tracking

---

## Rollback Plan

If issues arise:
1. Keep Ascora routes commented out
2. Document issues
3. Complete refactor offline
4. Deploy when stable

---

## Next Actions

1. ✅ Document the pattern mismatch (this file)
2. ⏳ Decide on solution approach
3. ⏳ Refactor AscoraIntegrationService
4. ⏳ Refactor ascoraRoutes
5. ⏳ Uncomment routes in index.ts
6. ⏳ Test with PostgreSQL
7. ⏳ Run database migration
8. ⏳ Full integration testing

---

**Document Created**: 2025-10-19
**Status**: Analysis Complete - Implementation Pending
**Recommendation**: Option 1 (Adapt to pg-promise)
**Priority**: High - Blocks integration completion

---

*End of Guide*
