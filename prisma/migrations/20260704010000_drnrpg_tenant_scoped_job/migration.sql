-- RA-6968 — Tenant-scope the DrNrpgJobSync unique identity.
--
-- Before: `drNrpgJobId` was globally @unique. A DR-NRPG jobId is only unique
-- WITHIN an integration (tenant), so the inbound webhook upsert keyed on the
-- global jobId let one tenant's event overwrite another tenant's job row.
--
-- After: uniqueness is (integrationId, drNrpgJobId).
--
-- Two-step, additive and safe:
--   Step 1 CREATEs the tenant-scoped compound unique BEFORE Step 2 DROPs the
--   global one, so a unique guarantee is never absent mid-migration.
--
-- Existing-data implication: the current global UNIQUE on drNrpgJobId
-- guarantees there are NO duplicate drNrpgJobId rows today, so the compound
-- index in Step 1 cannot fail on existing data — the migration is safe to
-- deploy without a backfill or de-duplication step.

-- Step 1 — add the tenant-scoped compound unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "DrNrpgJobSync_integrationId_drNrpgJobId_key"
    ON "DrNrpgJobSync" ("integrationId", "drNrpgJobId");

-- Step 2 — drop the global single-column unique. It was created inline in the
-- CREATE TABLE as a UNIQUE constraint, so drop the constraint; the DROP INDEX
-- fallback covers environments where it exists as a standalone unique index.
ALTER TABLE "DrNrpgJobSync" DROP CONSTRAINT IF EXISTS "DrNrpgJobSync_drNrpgJobId_key";
DROP INDEX IF EXISTS "DrNrpgJobSync_drNrpgJobId_key";
