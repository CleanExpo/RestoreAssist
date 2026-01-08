# RestoreAssist Project Context

**IMPORTANT**: Read `rules.md` first - it contains non-negotiable enforcement guidelines.

---

## Project Overview

**RestoreAssist** is a Next.js web application for data restoration services with subscription management.

- **Production URL**: https://restoreassist.app
- **Framework**: Next.js 15.0.0
- **Language**: TypeScript
- **Deployment**: Vercel (Sydney region)
- **Database**: Supabase PostgreSQL

---

## Tech Stack & Versions

### Core Dependencies (LOCKED - Do Not Change Without Approval)

```json
{
  "next": "15.0.0", // DO NOT upgrade to 16.x (breaks next-auth)
  "react": "^18.2.0", // DO NOT upgrade to 19.x (breaks Next.js 15)
  "react-dom": "^18.2.0",
  "next-auth": "4.24.11", // Requires Next.js <=15 and nodemailer ^6.6.5
  "nodemailer": "^6.9.0", // DO NOT upgrade to 7.x (breaks next-auth)
  "@prisma/client": "^6.19.0",
  "stripe": "latest"
}
```

### Dev Dependencies

```json
{
  "@types/react": "^18", // Must match React major version
  "@types/react-dom": "^18",
  "typescript": "latest",
  "prisma": "^6.19.0"
}
```

**Version Compatibility Matrix:**

- Next.js 15.0.0 ← Requires → React 18.2.0
- next-auth 4.24.11 ← Requires → Next.js <=15 AND nodemailer ^6.6.5
- React 18.2.0 ← Compatible with → Next.js 15.0.0

---

## Key Directory Structure

```
RestoreAssist/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── auth/            # NextAuth endpoints
│   │   ├── user/            # User management
│   │   └── stripe/          # Payment webhooks
│   ├── dashboard/           # Protected user dashboard
│   ├── pricing/             # Pricing page
│   └── page.tsx             # Homepage
├── components/              # React components
├── lib/                     # Utilities and config
├── prisma/                  # Database schema and migrations
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Migration files
├── testing/                 # Autonomous testing system
│   ├── orchestrator.js      # Test coordinator
│   ├── agents/              # Specialized test agents
│   │   ├── frontend-agent.js
│   │   ├── api-agent.js
│   │   ├── security-agent.js
│   │   ├── database-agent.js
│   │   └── performance-agent.js
│   ├── config/              # Test configuration
│   │   └── test-config.json
│   └── reports/             # Test result reports
├── public/                  # Static assets
├── .env                     # Local environment variables
├── .env.vercel.production   # Vercel production env (pulled locally)
├── vercel.json              # Vercel deployment config
├── package.json             # Dependencies (npm only)
├── .npmrc                   # npm configuration
├── rules.md                 # This enforcement system
└── CLAUDE.md                # This file
```

---

## Core Commands

### Development

```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Build for production
npm run start            # Start production server locally
npm run lint             # Run ESLint
```

### Database (Prisma)

```bash
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Run migrations in development
npx prisma migrate deploy # Deploy migrations to production
npx prisma studio        # Open database GUI
```

### Deployment

```bash
vercel deploy --prod     # Deploy to production
vercel env ls            # List environment variables
vercel env pull          # Pull env vars to .env.vercel.production
vercel env add <VAR>     # Add environment variable
vercel env rm <VAR>      # Remove environment variable
```

**IMPORTANT**: When adding env vars via CLI, use `printf` NOT `echo`:

```bash
# ✅ CORRECT - No newlines
printf "value" | vercel env add VAR_NAME production

# ❌ WRONG - Adds \n newline character
echo "value" | vercel env add VAR_NAME production
```

### Testing

```bash
node testing/orchestrator.js     # Run all test agents
node testing/agents/frontend-agent.js '{"productionUrl":"https://restoreassist.app"}'
node testing/agents/api-agent.js '{"productionUrl":"https://restoreassist.app"}'
node testing/agents/security-agent.js '{"productionUrl":"https://restoreassist.app"}'
node testing/agents/database-agent.js '{}'
node testing/agents/performance-agent.js '{"productionUrl":"https://restoreassist.app"}'
```

---

## Package Manager Rules

**USE npm ONLY** - This project uses npm, NOT pnpm or yarn.

**Configuration**: `.npmrc` contains:

```
legacy-peer-deps=true
```

This allows installation despite peer dependency warnings from next-auth.

**Lock Files**:

- ✅ `package-lock.json` - Commit this
- ❌ `pnpm-lock.yaml` - Delete if present (causes Vercel build failures)
- ❌ `yarn.lock` - Never create

**Installation**:

```bash
npm install                    # Standard install
npm install --legacy-peer-deps # Explicit legacy mode
```

---

## Environment Variables

### Required Variables (Production)

**Database (Supabase)**:

```bash
DATABASE_URL              # Pooled connection (port 6543)
DIRECT_URL                # Direct connection (port 5432)
POSTGRES_URL              # Legacy pooled URL
POSTGRES_PRISMA_URL       # Legacy Prisma URL
```

**Authentication (NextAuth)**:

```bash
NEXTAUTH_URL              # https://restoreassist.app
NEXTAUTH_SECRET           # Random secret (32+ chars)
```

**Supabase**:

```bash
SUPABASE_URL              # https://[project].supabase.co
SUPABASE_ANON_KEY         # Public anon key
SUPABASE_SERVICE_ROLE_KEY # Private service role key (sensitive)
```

**Stripe**:

```bash
STRIPE_SECRET_KEY         # sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET     # whsec_... for webhook verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY # pk_live_... or pk_test_...
```

**Email (Nodemailer)**:

```bash
EMAIL_SERVER_USER         # SMTP username
EMAIL_SERVER_PASSWORD     # SMTP password
EMAIL_SERVER_HOST         # SMTP host
EMAIL_SERVER_PORT         # SMTP port (usually 587)
EMAIL_FROM                # From address
```

### Environment Variable Management

**NEVER commit sensitive values to git**:

- ✅ Store in Vercel dashboard
- ✅ Use `vercel env add` CLI
- ✅ Keep in local `.env` (gitignored)
- ❌ Hardcode in vercel.json
- ❌ Commit to repository
- ❌ Put in documentation files

**Updating Production Variables**:

1. Remove old: `vercel env rm VAR_NAME production`
2. Add new: `printf "new_value" | vercel env add VAR_NAME production`
3. Deploy: `vercel deploy --prod`

---

## Database Schema (Prisma)

### Current Supabase Projects

**Project 1 (OLD - possibly deprecated)**:

- Project ID: `ithmbupvmriruprrdiob`
- Region: AWS Sydney (ap-southeast-2)

**Project 2 (NEW - currently being set up)**:

- Project ID: `qwoggbbavikzhypzodcr`
- Region: AWS Sydney (ap-southeast-2)

**ACTION REQUIRED**: Verify which project should be used in production.

### Connection Strings Format

**Pooled (for application queries)**:

```
postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Direct (for migrations)**:

```
postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
```

### Migration Rules

**ALWAYS test migrations locally first**:

```bash
npx prisma migrate dev --name descriptive_name
```

**Deploy to production**:

```bash
npx prisma migrate deploy
```

**NEVER**:

- Run migrations directly on production without testing
- Delete migrations from the `migrations/` folder
- Edit applied migrations

---

## Code Style & Naming Conventions

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Use type for unions/intersections

### React Components

- Use functional components with hooks
- Prefer named exports for components
- Use PascalCase for component names
- Use camelCase for functions and variables

### File Naming

- Components: `ComponentName.tsx`
- Pages: `page.tsx` (Next.js App Router)
- API routes: `route.ts` (Next.js App Router)
- Utilities: `utility-name.ts`

### API Routes

- Use REST conventions (GET, POST, PUT, DELETE)
- Return consistent response format:
  ```typescript
  { success: true, data: {...} }
  { success: false, error: "message" }
  ```
- Always handle errors with try/catch
- Use appropriate HTTP status codes

---

## Repository Workflow

### Branching Strategy

- `main` - Production branch (protected)
- Feature branches: `feature/description`
- Fix branches: `fix/description`

### Commit Messages

- Use conventional commits format
- Examples:
  - `feat: Add user dashboard`
  - `fix: Resolve database connection issue`
  - `chore: Update dependencies`
  - `docs: Update README`

### Pull Requests

- Create PR from feature branch to main
- Include description of changes
- Run tests before creating PR
- Squash and merge preferred

### Git Rules

- NEVER commit `.env` files
- NEVER commit credential-containing documentation
- Always run `git status` before committing
- Review `git diff` before committing

---

## Vercel Deployment Configuration

### vercel.json Structure

```json
{
  "version": 2,
  "buildCommand": "npm run vercel-build",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["syd1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  }
}
```

**Rules**:

- ❌ DO NOT add `env` section (use Vercel dashboard/CLI instead)
- ❌ DO NOT specify `runtime` (Vercel auto-detects)
- ✅ DO use `buildCommand` for custom build steps
- ✅ DO use `regions: ["syd1"]` for Sydney deployment

### Build Process

Vercel runs:

1. `npm install` (or custom installCommand)
2. Prisma generate (if detected)
3. Database migrations (if DATABASE_URL present)
4. `npm run build` (or custom buildCommand)

**Build Blockers**:

- Missing or invalid DATABASE_URL → Migration failure
- Peer dependency conflicts → Install failure
- Invalid vercel.json → Deployment rejection
- Missing required env vars → Runtime failure

---

## Automated Testing System

### Architecture

**Orchestrator Pattern**:

- `testing/orchestrator.js` - Main coordinator
- 5 specialized agents run autonomously
- Parallel or sequential execution
- Aggregated JSON reports

### Test Agents

1. **Frontend Agent** (`frontend-agent.js`)
   - Priority: High
   - Tests: Homepage load, navigation, auth flows, dashboard, pricing, visual regression, accessibility, performance
   - Will integrate: Playwright MCP for browser automation

2. **API Agent** (`api-agent.js`)
   - Priority: High
   - Tests: Auth endpoints, user endpoints, subscription endpoints, error handling, rate limiting
   - Uses: fetch() for HTTP requests

3. **Security Agent** (`security-agent.js`)
   - Priority: Critical
   - Tests: XSS vulnerabilities, CSRF protection, SQL injection, auth bypass, environment exposure, data leaks
   - Uses: fetch() + regex patterns

4. **Database Agent** (`database-agent.js`)
   - Priority: High
   - Tests: Connection health, migration status, data integrity, query performance
   - Uses: Prisma client

5. **Performance Agent** (`performance-agent.js`)
   - Priority: Medium
   - Tests: Page load times, API response times, Core Web Vitals, memory usage
   - Uses: fetch() + timing measurements

### Running Tests

**All agents in parallel**:

```bash
node testing/orchestrator.js
```

**Single agent**:

```bash
node testing/agents/frontend-agent.js '{"productionUrl":"https://restoreassist.app"}'
```

**Configuration**:
Edit `testing/config/test-config.json` to:

- Enable/disable specific agents
- Set priority levels
- Choose parallel vs sequential execution
- Configure test selection

---

## Monorepo Structure

RestoreAssist is built with **Turborepo** for workspace management, but currently only `apps/web` is operational.

### Current Workspace Status

```
RestoreAssist/
├── apps/
│   ├── web/                    # Next.js 15 fullstack (ACTIVE)
│   │   ├── app/               # App Router (pages + API routes)
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities & config
│   │   ├── prisma/            # Database schema & migrations
│   │   └── package.json
│   └── backend/               # FastAPI backend (SCAFFOLDED ONLY - NOT OPERATIONAL)
│       └── (not deployed)
├── packages/
│   ├── shared/                # Shared TypeScript types (PLACEHOLDER)
│   └── config/                # ESLint/TypeScript/Tailwind config (PLACEHOLDER)
├── turbo.json                 # Turbo configuration
├── package.json               # Root workspace
└── ...
```

### Workspace Commands

**Development**:

```bash
npm run dev              # Start Next.js dev server (localhost:3000)
npm run build            # Build production bundle
npm run start            # Start production server locally
npm run lint             # Run ESLint on all packages
npm run type-check       # Run TypeScript type checking
```

### Important Notes

- ✅ **apps/web**: Production-ready Next.js 15 application
- ❌ **apps/backend**: Scaffolded only (NOT integrated or deployed)
- ❌ **packages/shared**: Placeholder (not in use)
- ❌ **packages/config**: Placeholder (shared config not used)

**All business logic runs in Next.js API routes** in `apps/web/app/api/`, NOT in a separate FastAPI backend.

---

## Database (Prisma)

RestoreAssist uses **Prisma ORM** as the SOLE database layer (no SQLAlchemy or other ORMs).

### Schema Location

```
apps/web/prisma/
├── schema.prisma         # Database schema definition (19+ models)
├── migrations/           # Migration history (19+ migrations)
│   ├── 001_init/
│   ├── 002_add_equipment/
│   ├── 003_add_stripe_integration/
│   └── ... (19+ total)
└── seed.ts (if present)  # Optional seed data
```

### Database Models (19+)

**Core Models**:

- `User` - Authentication and profile
- `Client` - Business customers
- `Report` - Inspection reports
- `Estimate` - Cost estimates
- `Scope` - Project scope items
- `Equipment` - Tools and equipment database
- `Material` - Materials and costs

**Billing Models**:

- `Subscription` - User subscriptions
- `Invoice` - Billing history
- `Payment` - Payment records

**Other Models**:

- `Session` - NextAuth sessions
- ... (9+ more domain models)

### Common Prisma Commands

**Development**:

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create and run a new migration
npx prisma migrate dev --name descriptive_name

# Open interactive database GUI
npx prisma studio

# Seed database with sample data
npx prisma db seed
```

**Production**:

```bash
# Deploy existing migrations
npx prisma migrate deploy

# Reset database (DEV ONLY - destroys data)
npx prisma migrate reset
```

### Migration Workflow

**For Adding Features**:

1. Edit `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name feature_name`
3. Prisma generates migration and updates client
4. Test locally
5. Deploy to Vercel (automatic migration)

**Rules**:

- ✅ Always test migrations locally first
- ✅ Create descriptive migration names
- ❌ NEVER delete migrations after they're deployed
- ❌ NEVER edit applied migrations
- ❌ NEVER run migrations directly on production

### Connection Strings

**Pooled (for queries)** - Port 6543:

```
postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Direct (for migrations)** - Port 5432:

```
postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
```

---

## Special Project Constraints

### Security Constraints

1. **NEVER expose credentials**:
   - No database passwords in code
   - No API keys in client-side code
   - No secrets in git history
   - No secrets in console.log statements

2. **NEVER commit credential files**:
   - Update `.gitignore` before creating credential docs
   - Check `git status` before committing
   - Use `git diff` to verify no secrets included

3. **Rotation Protocol**:
   - When rotating credentials, update ALL instances:
     - Local `.env`
     - Vercel production env
     - Vercel preview env
     - Any documentation (then gitignore it)

### Dependency Constraints

**DO NOT upgrade these without testing**:

- Next.js 15.0.0 → 16.x breaks next-auth
- React 18.2.0 → 19.x breaks Next.js 15
- nodemailer 6.9.0 → 7.x breaks next-auth

**If you must upgrade**:

1. Check next-auth peer dependencies
2. Test in development first
3. Verify build succeeds locally
4. Deploy to preview environment
5. Run full test suite
6. Only then deploy to production

### Build Constraints

**Vercel Build Requirements**:

- Must have valid DATABASE_URL for Prisma migrations
- Must use npm (not pnpm)
- Must have `.npmrc` with `legacy-peer-deps=true`
- Must not have `pnpm-lock.yaml` file

**Build Failure → Check**:

1. Database credentials valid?
2. Environment variables have newlines? (use `printf` not `echo`)
3. Peer dependency conflicts? (check next-auth requirements)
4. Lock file conflicts? (delete pnpm-lock.yaml)

---

## Decision Log

### 2025-01-07: Dependency Version Lockdown

**Decision**: Lock Next.js at 15.0.0, React at 18.2.0, nodemailer at 6.9.0
**Reason**: next-auth 4.24.11 has strict peer dependency requirements
**Impact**: Cannot upgrade to Next.js 16 or React 19 without upgrading next-auth
**Alternatives Considered**: Upgrade next-auth (decided against due to breaking changes)

### 2025-01-07: Automated Testing System

**Decision**: Implement orchestrator pattern with 5 specialized test agents
**Reason**: User requested autonomous testing to avoid manual page-by-page validation
**Impact**: Comprehensive automated testing replaces manual QA
**Alternatives Considered**: Manual testing (too slow), single monolithic test suite (less maintainable)

### 2025-01-07: Environment Variable CLI Method

**Decision**: Use `printf` instead of `echo` for Vercel env var CLI commands
**Reason**: `echo` adds `\n` newline characters to values, breaking database authentication
**Impact**: All env vars must be added with `printf "value" | vercel env add`
**Alternatives Considered**: Manual dashboard entry (not scriptable), heredoc (more complex)

### 2025-01-07: Package Manager Standardization

**Decision**: Use npm exclusively, not pnpm
**Reason**: Vercel detected pnpm-lock.yaml but tried to use npm, causing build failures
**Impact**: Must delete pnpm-lock.yaml, only commit package-lock.json
**Alternatives Considered**: Switch to pnpm fully (decided against due to Vercel compatibility issues)

---

## Troubleshooting Guide

### Database Connection Failures

**Symptom**: `P1000: Authentication failed`

**Checks**:

1. Is password correct? Verify in Supabase dashboard
2. Is project ID correct in connection string?
3. Are there newline characters? Check with `vercel env pull`
4. Is IP allowlist configured? (Should be 0.0.0.0/0 for Vercel)
5. Is database paused? (Supabase pauses inactive projects)

**Fix**:

```bash
# Remove old env var
vercel env rm DATABASE_URL production

# Add new with printf (no newlines)
printf "postgresql://..." | vercel env add DATABASE_URL production

# Redeploy
vercel deploy --prod
```

### Build Dependency Conflicts

**Symptom**: `npm error peer dependency conflict`

**Checks**:

1. Is .npmrc present with `legacy-peer-deps=true`?
2. Are versions matching the locked versions in this doc?
3. Is pnpm-lock.yaml present? (delete it)

**Fix**:

```bash
# Ensure .npmrc exists
echo "legacy-peer-deps=true" > .npmrc

# Remove conflicting lock files
rm -f pnpm-lock.yaml

# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Vercel Deployment Rejections

**Symptom**: Deployment fails before build starts

**Checks**:

1. Does vercel.json have `env` section? (remove it)
2. Does vercel.json have invalid `runtime`? (remove it)
3. Are required env vars set in Vercel? (check dashboard)

**Fix**:

```bash
# Check current env vars
vercel env ls

# Validate vercel.json structure
cat vercel.json | jq .

# Redeploy
vercel deploy --prod
```

---

## Next Steps / TODO

### Critical Priority

- [ ] Resolve database credentials issue (verify correct Supabase project)
- [ ] Deploy successfully to production with valid credentials
- [ ] Run full autonomous test suite via orchestrator

### High Priority

- [ ] Integrate Playwright MCP into frontend-agent.js
- [ ] Add real API testing logic to api-agent.js
- [ ] Add database connection testing to database-agent.js
- [ ] Create comprehensive test reports

### Medium Priority

- [ ] Set up GitHub Actions for CI/CD
- [ ] Add pre-commit hooks for linting
- [ ] Implement monitoring/alerting for production
- [ ] Add comprehensive error tracking (Sentry)

### Low Priority

- [ ] Optimize bundle size
- [ ] Add E2E tests for critical user flows
- [ ] Implement feature flags system
- [ ] Add comprehensive analytics

---

## Questions to Ask When Stuck

1. Have I read rules.md first?
2. Have I checked the locked dependency versions?
3. Have I verified environment variables have no newlines?
4. Have I checked which Supabase project is being used?
5. Have I run the build locally first?
6. Have I checked the Vercel build logs?
7. Have I verified credentials in Supabase dashboard?
8. Have I consulted the troubleshooting guide above?

---

## Contact & Resources

- **Production URL**: https://restoreassist.app
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://app.supabase.com
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Repository**: Check `git remote -v`

---

**Last Updated**: 2026-01-08
**Maintained By**: Project Owner
**Version**: 1.0
