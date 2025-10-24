# Development Guide

**Version:** 1.0.0
**Last Updated:** October 23, 2025

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Running the Application](#running-the-application)
4. [Database Management](#database-management)
5. [Testing](#testing)
6. [Common Development Tasks](#common-development-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Architecture Overview](#architecture-overview)

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **PostgreSQL** 14+ (or Docker)
- **npm** 9.x or higher
- **Git**
- **VS Code** (recommended)

### Quick Start (5 minutes)

```bash
# Clone the repository
git clone https://github.com/your-org/restore-assist.git
cd restore-assist

# Install dependencies
npm install

# Copy environment files
cp packages/backend/.env.example packages/backend/.env.local
cp packages/frontend/.env.example packages/frontend/.env.local

# Start PostgreSQL (if using Docker)
docker-compose up -d postgres

# Run database migrations
npm run db:migrate --workspace=packages/backend

# Start development servers
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:3001

## Development Setup

### 1. Environment Configuration

#### Backend (.env.local)
```env
# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/restoreassist_dev
DATABASE_POOL_MAX=5

# Authentication (Generate these!)
JWT_SECRET=dev_jwt_secret_change_this_in_production_minimum_64_chars_long
JWT_EXPIRY=7d
SESSION_SECRET=dev_session_secret_32_chars_minimum

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_test_monthly
STRIPE_PRICE_ID_ANNUAL=price_test_annual

# External Services (Optional for dev)
ANTHROPIC_API_KEY=sk-ant-...
SENDGRID_API_KEY=SG...
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...

# Development Settings
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug
```

#### Frontend (.env.local)
```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001
VITE_PUBLIC_URL=http://localhost:5173

# Stripe (Test Mode)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Google OAuth (Optional)
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com

# Development Features
VITE_ENABLE_DEVTOOLS=true
VITE_ENABLE_MOCK_DATA=false
```

### 2. Database Setup

#### Option A: Local PostgreSQL
```bash
# Create database
createdb restoreassist_dev

# Set DATABASE_URL in .env.local
DATABASE_URL=postgresql://localhost:5432/restoreassist_dev

# Run migrations
npm run db:migrate --workspace=packages/backend
```

#### Option B: Docker PostgreSQL
```bash
# Start PostgreSQL container
docker-compose up -d postgres

# Database will be available at:
# postgresql://postgres:password@localhost:5432/restoreassist_dev

# Run migrations
npm run db:migrate --workspace=packages/backend
```

#### Option C: In-Memory Fallback (No DB)
```bash
# Set in backend/.env.local
USE_IN_MEMORY_STORE=true

# Limited functionality, good for UI development
```

### 3. IDE Setup (VS Code)

#### Recommended Extensions
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-playwright.playwright",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

#### Workspace Settings
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## Running the Application

### Development Mode

#### Start Everything
```bash
npm run dev
```
- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Hot reload enabled

#### Start Individual Services
```bash
# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend

# Database migrations
npm run db:migrate --workspace=packages/backend
```

### Production Mode (Local Testing)

```bash
# Build everything
npm run build

# Start production servers
npm run start
```

### Using Docker

```bash
# Build and start all services
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Database Management

### Running Migrations

```bash
# Run all pending migrations
npm run db:migrate --workspace=packages/backend

# Create a new migration
npm run db:migrate:create --workspace=packages/backend -- "migration_name"

# Rollback last migration (dev only)
npm run db:migrate:rollback --workspace=packages/backend
```

### Migration Files Location
```
packages/backend/src/db/migrations/
├── 001_create_reports.sql
├── 002_add_indexes.sql
├── 003_add_performance_indexes.sql
├── 004_add_foreign_keys.sql
├── 005_create_users_table.sql
├── 006_create_auth_tables.sql
├── 007_create_trial_tables.sql
├── 008_add_foreign_keys_and_constraints.sql
└── 009_rollback_scripts.sql
```

### Database Commands

```bash
# Connect to database
psql $DATABASE_URL

# Useful queries
SELECT * FROM schema_migrations;  -- Check migration status
SELECT COUNT(*) FROM users;       -- User count
SELECT * FROM subscriptions WHERE status = 'active';  -- Active subs

# Backup database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

## Testing

### Running Tests

#### All Tests
```bash
npm test
```

#### Unit Tests
```bash
# Backend unit tests
npm run test:unit --workspace=packages/backend

# Frontend unit tests
npm run test:unit --workspace=packages/frontend
```

#### Integration Tests
```bash
npm run test:integration --workspace=packages/backend
```

#### E2E Tests (Playwright)
```bash
# Install Playwright browsers (first time)
npx playwright install

# Run E2E tests
npm run test:e2e --workspace=packages/frontend

# Run in UI mode (recommended for development)
npm run test:e2e:ui --workspace=packages/frontend

# Run specific test file
npm run test:e2e --workspace=packages/frontend -- trial-signup.spec.ts
```

### Writing Tests

#### Unit Test Example
```typescript
// packages/backend/tests/unit/authService.test.ts
import { AuthService } from '../../src/services/authService';

describe('AuthService', () => {
  it('should hash passwords securely', async () => {
    const password = 'TestPassword123!';
    const hashed = await AuthService.hashPassword(password);

    expect(hashed).not.toBe(password);
    expect(hashed).toMatch(/^\$2[ayb]\$.{56}$/);
  });
});
```

#### E2E Test Example
```typescript
// packages/frontend/tests/e2e-claude/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/login');

  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
});
```

### Test Coverage

```bash
# Generate coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

## Common Development Tasks

### Adding a New API Endpoint

1. **Create Route Handler**
```typescript
// packages/backend/src/routes/newRoutes.ts
import { Router } from 'express';

const router = Router();

router.get('/new-endpoint', async (req, res) => {
  // Implementation
});

export default router;
```

2. **Register in Main App**
```typescript
// packages/backend/src/index.ts
import newRoutes from './routes/newRoutes';

app.use('/api/new', newRoutes);
```

3. **Add TypeScript Types**
```typescript
// packages/backend/src/types/index.ts
export interface NewEndpointResponse {
  data: any;
  success: boolean;
}
```

### Adding a New React Component

1. **Create Component**
```tsx
// packages/frontend/src/components/NewComponent.tsx
interface NewComponentProps {
  title: string;
}

export function NewComponent({ title }: NewComponentProps) {
  return <div>{title}</div>;
}
```

2. **Add Tests**
```tsx
// packages/frontend/src/components/NewComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { NewComponent } from './NewComponent';

test('renders title', () => {
  render(<NewComponent title="Test" />);
  expect(screen.getByText('Test')).toBeInTheDocument();
});
```

### Working with Database

1. **Create Migration**
```sql
-- packages/backend/src/db/migrations/010_add_new_table.sql
CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

2. **Create Repository**
```typescript
// packages/backend/src/repositories/newRepository.ts
import { db } from '../db/connection';

export class NewRepository {
  async create(data: any) {
    return db.one('INSERT INTO new_table (name) VALUES ($1) RETURNING *', [data.name]);
  }
}
```

3. **Create Service**
```typescript
// packages/backend/src/services/newService.ts
import { NewRepository } from '../repositories/newRepository';

export class NewService {
  constructor(private repo = new NewRepository()) {}

  async createItem(data: any) {
    // Business logic
    return this.repo.create(data);
  }
}
```

### Debugging

#### Backend Debugging
```json
// .vscode/launch.json
{
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev:backend"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

#### Frontend Debugging
- Use React DevTools extension
- Use browser debugger with source maps
- Add `debugger;` statements in code

#### Database Debugging
```bash
# Enable query logging
export DEBUG=pg-promise:query

# Or in code
db.$config.options.query = (e) => {
  console.log('QUERY:', e.query);
};
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed
```bash
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:**
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env.local
- Verify port 5432 is not blocked

#### 2. Stripe Webhook Signature Verification Failed
```bash
Error: No signatures found matching the expected signature
```
**Solution:**
- Use correct webhook secret for your environment
- Use Stripe CLI for local testing:
```bash
stripe listen --forward-to localhost:3001/api/subscriptions/webhook
```

#### 3. TypeScript Errors
```bash
npm run typecheck
```
**Solution:**
- Run `npm install` to ensure all types are installed
- Check for `@types/*` packages
- Use `npm run fix:types` for auto-fixes

#### 4. Port Already in Use
```bash
Error: listen EADDRINUSE :::3001
```
**Solution:**
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>
```

#### 5. Migration Failed
```bash
Error: relation "users" already exists
```
**Solution:**
- Check migration history: `SELECT * FROM schema_migrations;`
- Manually mark as complete if needed
- Use rollback for development

### Development Tips

1. **Use Development Seeds**
```bash
npm run db:seed --workspace=packages/backend
```

2. **Clear All Data**
```bash
npm run db:reset --workspace=packages/backend
```

3. **Monitor Performance**
```bash
# Watch backend logs
npm run dev:backend -- --inspect

# Use Chrome DevTools for profiling
chrome://inspect
```

4. **Test Email Locally**
- Use [Ethereal Email](https://ethereal.email/) for testing
- Or use `console.log` in development

5. **Mock External Services**
```typescript
// In development
if (process.env.NODE_ENV === 'development') {
  return mockStripeResponse();
}
```

## Architecture Overview

### Project Structure
```
restore-assist/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── services/      # Business logic
│   │   │   ├── repositories/  # Data access
│   │   │   ├── middleware/    # Express middleware
│   │   │   ├── db/            # Database setup
│   │   │   ├── types/         # TypeScript types
│   │   │   └── utils/         # Utilities
│   │   └── tests/
│   └── frontend/
│       ├── src/
│       │   ├── components/    # React components
│       │   ├── pages/         # Page components
│       │   ├── contexts/      # React contexts
│       │   ├── hooks/         # Custom hooks
│       │   ├── services/      # API clients
│       │   ├── types/         # TypeScript types
│       │   └── utils/         # Utilities
│       └── tests/
├── docs/                       # Documentation
├── scripts/                    # Build/deploy scripts
└── docker/                     # Docker configs
```

### Key Design Patterns

1. **Repository Pattern** - Data access abstraction
2. **Service Layer** - Business logic separation
3. **Middleware Pipeline** - Cross-cutting concerns
4. **Dependency Injection** - Testability
5. **Error Boundaries** - Graceful error handling

### Technology Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL with pg-promise
- **Authentication:** JWT with refresh tokens
- **Payments:** Stripe
- **Testing:** Jest, Playwright, Testing Library
- **Deployment:** Vercel, Docker

---

## Need Help?

- Check existing documentation in `/docs`
- Search through GitHub issues
- Ask in team Slack channel
- Review test files for examples

**Happy coding!** 🚀