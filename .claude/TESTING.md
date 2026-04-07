# Testing — RestoreAssist

## Quick Reference

```bash
# Type check (fastest verification — run after every change)
pnpm type-check

# Lint
pnpm lint

# E2E tests (all)
npx playwright test

# E2E tests (single file)
npx playwright test e2e/auth.spec.ts

# E2E tests (headed — see browser)
npx playwright test --headed

# Unit tests (interview engine)
npx vitest run lib/interview/__tests__/

# Build check (full production build)
pnpm build
```

## Before You Say You're Done

1. Run `pnpm type-check` — must pass with zero errors
2. If you changed API routes: verify with `curl` or browser
3. If you changed Prisma schema: run `npx prisma migrate dev --name descriptive_name`
4. If you changed UI components: check responsive at mobile (375px) and desktop (1280px)
5. If you changed integration logic: verify fire-and-forget pattern (no `await` in request handler)
6. Provide a verification checklist per `.claude/rules/verification-gate.md`

## Test Data Setup

The dev database is Supabase PostgreSQL. Connection details in `.env.local`:

- `DATABASE_URL` — pooled connection (port 6543, append `?pgbouncer=true`)
- `DIRECT_URL` — direct connection (port 5432, for migrations)

No seed script exists. Create test data via the dashboard UI or API routes.

## E2E Test Structure

```
e2e/
├── auth.spec.ts          # Login/signup/logout flows
├── billing.spec.ts       # Stripe checkout + subscription
├── crm-health.spec.ts    # CRM dashboard data loading
├── health.spec.ts        # Basic page health checks
├── navigation.spec.ts    # Route navigation + deep links
├── procurement.spec.ts   # Cost library + procurement flows
├── warehouse.spec.ts     # Equipment/warehouse management
└── workshop.spec.ts      # Report workshop + AI generation
```

Config: `playwright.config.ts` — runs against `http://localhost:3000`, parallel in CI.

## Mocking Conventions

- No mock libraries in use. E2E tests hit real API routes against the dev database.
- Integration tests for external services (Xero, Stripe, etc.) use `lib/integrations/mock-data.ts` and `lib/integrations/dev-mode.ts` for local development.
- Unit tests in `lib/interview/__tests__/` test pure functions without mocks.

## Regression Areas

After changes to these areas, run the corresponding checks:

| Area              | Verify                                              |
| ----------------- | --------------------------------------------------- |
| Auth / middleware | `npx playwright test e2e/auth.spec.ts`              |
| Inspection CRUD   | `curl` the `/api/inspections` endpoints             |
| Report generation | Generate a test report via dashboard                |
| Invoice system    | `npx playwright test e2e/billing.spec.ts`           |
| Integration sync  | Check `IntegrationSyncLog` for errors after sync    |
| Prisma schema     | `npx prisma validate` then `npx prisma migrate dev` |
