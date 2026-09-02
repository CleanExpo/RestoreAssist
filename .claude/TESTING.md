# Testing — RestoreAssist

## Quick Reference

```bash
# Type check (fastest verification — run after every change)
npm run type-check

# Lint
npm run lint

# E2E tests (all)
npx --no-install playwright test

# E2E tests (single file)
npx --no-install playwright test e2e/auth.spec.ts

# E2E tests (headed — see browser)
npx --no-install playwright test --headed

# Unit tests (interview engine)
npx --no-install vitest run lib/interview/__tests__/

# Build check (full production build)
npm run build
```

## Before You Say You're Done

1. Run `npm run type-check` — must pass with zero errors
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

Config: `config/playwright.config.ts` — runs against `http://localhost:3000`, parallel in CI.

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
| Agent hooks       | `bash .claude/hooks/tests/test-guards.sh`           |

## Testing the agent's own configuration

The hooks, skills and rules under `.claude/` steer every session, and they are the
one part of this repo that no other suite covers.

```bash
bash .claude/hooks/tests/test-guards.sh    # the two PreToolUse guards
```

The suite ends by neutering each guard and re-running the deny cases. If an inert
guard still reads as a deny, the suite reports `BROKEN` and exits non-zero, because
an assertion that passes against a guard doing nothing is not testing the guard.

That check exists because of what it found. Both guards previously lived inline in
`.claude/settings.local.json`, read `$CLAUDE_TOOL_INPUT` and `$CLAUDE_FILE_PATH`
(variables Claude Code does not set — the payload arrives as JSON on stdin), and
exited 1 on a match. Exit 1 is a non-blocking hook error; only exit 2, or a
`permissionDecision` of `"deny"`, blocks. So for as long as they existed they
printed the word `BLOCKED` and let the call through. Two independent defects, in a
control everyone believed was holding.

The lesson generalises: **a hook is not a control until you have watched it refuse
something.** Add a deny case and a dead-check for any guard you add.
