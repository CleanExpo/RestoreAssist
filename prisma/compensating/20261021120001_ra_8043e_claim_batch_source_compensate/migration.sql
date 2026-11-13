-- RA-8043e Slice 1a: forward compensating migration for
-- 20261021120000_ra_8043e_claim_batch_source (M1).
--
-- NOT part of prisma/migrations. Kept here as a rehearsed artefact. If M1 must
-- be undone in production after it has finished, first revert the RA-8043e
-- code (code from before RA-8043e works on both schemas), then copy this
-- folder into prisma/migrations in its own reviewed change and apply it with
-- the normal `npm run ops:migrate:deploy` path. Do not use
-- `prisma migrate resolve --rolled-back`: Prisma refuses it for a migration
-- that finished.
--
-- schema.prisma must be returned to its pre-RA-8043e models in the same change,
-- or the CI drift check will fail.

ALTER TABLE "ClaimAnalysisBatch" DROP CONSTRAINT IF EXISTS "claim_batch_source_org";

ALTER TABLE "ClaimAnalysisBatch" DROP CONSTRAINT IF EXISTS "ClaimAnalysisBatch_organizationId_fkey";

DROP INDEX IF EXISTS "ClaimAnalysis_batchId_googleDriveFileId_key";

DROP INDEX IF EXISTS "ClaimAnalysisBatch_organizationId_idx";

ALTER TABLE "ClaimAnalysisBatch" DROP COLUMN IF EXISTS "organizationId",
DROP COLUMN IF EXISTS "source";

DROP TYPE IF EXISTS "ClaimDriveSource";
