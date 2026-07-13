# Archived Supabase SQL migrations

Moved out of the repo root (`supabase/`) on 2026-07-12.

**Deploy SSOT remains Prisma** (`prisma/migrations` via `prisma migrate deploy`).

These files are kept only because static RLS audit gates (`pnpm audit:rls`,
`scripts/audit-rls-coverage.ts`) and `scripts/rls-harness` still parse a few
of them. Do not apply from here in production deploys.

Runtime DB access for storage/video still uses `@supabase/supabase-js`
(`lib/supabase.ts`) against the hosted project — that is unrelated to this folder.
