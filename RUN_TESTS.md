# How to Run RestoreAssist Tests

## Quick Start

### Run All Tests
```bash
# HTTP-based comprehensive test
node test-login-flow-complete.js

# Playwright-based UI test
node test-production-comprehensive.js

# API endpoint test
node test-api-direct.js
```

### After Database is Fixed

1. **Verify database connection:**
```bash
node test-user-verification.js
```

2. **Run comprehensive tests:**
```bash
node test-production-comprehensive.js
```

3. **Check results:**
```bash
# JSON results
type test-results-production-comprehensive.json

# Markdown report
type TEST_RESULTS_PRODUCTION_COMPREHENSIVE.md

# Screenshots
dir screenshots\comprehensive-test
```

## Test Scripts

| Script | Purpose | Duration |
|--------|---------|----------|
| `test-login-flow-complete.js` | Full HTTP-based testing | ~45s |
| `test-production-comprehensive.js` | Playwright UI automation | ~1-2min |
| `test-api-direct.js` | Direct API endpoint testing | ~10s |
| `test-user-verification.js` | Database user check | ~5s |
| `test-login-debug.js` | Interactive debugging | Manual |

## Current Status

🔴 **Database connection failing** - "Tenant or user not found"
🔴 **User authentication not working**
⚠️ **All authenticated features blocked**

## Fix Database First

1. Log in to Supabase dashboard
2. Check database status (not paused)
3. Get new connection string
4. Update in Vercel:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXTAUTH_URL` (set to https://restoreassist.app)
5. Redeploy
6. Run tests again

## Test Results Location

- **JSON:** `test-results-production-comprehensive.json`
- **Markdown:** `TEST_RESULTS_PRODUCTION_COMPREHENSIVE.md`
- **Full Report:** `COMPREHENSIVE_TEST_RESULTS_FINAL.md`
- **Screenshots:** `screenshots/comprehensive-test/`
