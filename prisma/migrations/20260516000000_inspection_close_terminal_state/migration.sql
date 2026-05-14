-- SP-A (Wave 1) — Job-Close Terminal State.
--
-- Additive migration. No destructive ops.
--   1. Extend `InspectionStatus` with three new values (IN_BILLING, CLOSED, ARCHIVED).
--      Existing `COMPLETED` value is retained — SP-C will handle the
--      deprecation path separately.
--   2. Add four nullable columns to `Inspection`:
--        - closeSummary            TEXT      (client-facing summary, AI draft → user edit)
--        - completedAt             TIMESTAMP (set when close-button pressed)
--        - closePackageStorageKey  TEXT      (SP-E fire-and-forget hook writes here)
--        - handoverCompletedAt     TIMESTAMP (SP-J precondition; soft gap until SP-J ships)
--   3. Create a partial index on `Inspection(status)` for the terminal trio so
--      the SP-C Completed tab can scan only the relevant rows. `IF NOT EXISTS`
--      keeps the migration idempotent on environments where SP-C has
--      pre-deployed the index.
--
-- Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §8.

-- 1. Enum extension. Each value must be in its own statement — Postgres rejects
--    multiple ADD VALUEs in a single ALTER TYPE inside a transaction.
ALTER TYPE "InspectionStatus" ADD VALUE IF NOT EXISTS 'IN_BILLING';
ALTER TYPE "InspectionStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "InspectionStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- 2. New columns on Inspection.
ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "closeSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closePackageStorageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "handoverCompletedAt" TIMESTAMP(3);

-- 3. Partial index for SP-C Completed-tab scan. CONCURRENTLY so it does not
--    take an ACCESS EXCLUSIVE lock on the Inspection table during the
--    rollout. `IF NOT EXISTS` guards against a re-run.
--
-- Note: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
-- Prisma Migrate disables the implicit BEGIN when the migration contains
-- this directive — see prisma/migrations/<earlier>/migration.sql for the
-- established pattern in this repo.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Inspection_terminal_status_idx"
  ON "Inspection"("status")
  WHERE "status" IN ('IN_BILLING', 'CLOSED', 'ARCHIVED');
