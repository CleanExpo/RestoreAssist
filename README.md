# RestoreAssist

TypeScript / Next.js 15 App Router compliance platform for Australian water damage restoration.

## Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js v5
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Package manager**: pnpm (workspaces + Turbo)

## Development

```bash
pnpm install
pnpm dev
```

See `.claude/TESTING.md` for the full test reference and E2E setup.

## Running Tests Locally

The test suite has two modes depending on whether a local PostgreSQL instance is available.

### Default mode — no database required

```bash
npx vitest run
```

This runs all unit and integration tests that do not require a live DB connection.
**Expected result:** ~1776 tests pass, ~82 integration tests auto-skip.

### Full mode — with local database

Some tests exercise Prisma queries against a real schema. Spin up a local PostgreSQL instance and point `DATABASE_URL` at it:

```bash
# 1. Start a pgvector-enabled Postgres container (pgvector required — plain postgres:16 won't work)
docker run -d --name ra-test-pg --rm -p 55432:5432 \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=restoreassist_test \
  pgvector/pgvector:pg16

# 2. Copy and fill in the env file
cp .env.test.local.example .env.test.local
# Edit .env.test.local: set DATABASE_URL and DIRECT_URL to point at the container above

# 3. Push the schema (no migration history needed for test DBs)
set -a && source .env.test.local && set +a
npx prisma db push --skip-generate --accept-data-loss

# 4. Run the full suite
npx vitest run
```

**Expected result:** all ~1858 tests pass, 0 skipped.

### Quick reset script

A helper script at `~/fix-ra-db.zsh` resets the local test database against Supabase
for contributors who use the shared dev instance. Run it when the local schema drifts:

```bash
~/fix-ra-db.zsh
```

### Prerequisites

```bash
# Generate Prisma client before first run (or after schema changes)
pnpm prisma:generate
```

### Environment variables for tests

Copy `.env.test.local.example` → `.env.test.local` and fill in the values.
`.env.test.local` is gitignored and never committed.

Minimum required variables for the full DB suite:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection (append `?pgbouncer=true` for Supabase) |
| `DIRECT_URL` | Direct connection (port 5432, for migrations) |
| `NEXTAUTH_URL` | Must match the port `pnpm dev` runs on |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
