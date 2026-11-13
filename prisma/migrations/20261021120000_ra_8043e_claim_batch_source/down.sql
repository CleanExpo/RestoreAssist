-- Reverse of 20261021120000_ra_8043e_claim_batch_source (M1).
--
-- Drops everything M1 created, in reverse order: the CHECK, the foreign key,
-- both new indexes, the two columns and the enum. The global unique
-- "ClaimAnalysis_googleDriveFileId_key" is untouched (M1 never changed it).
-- Any FIRM_OAUTH batch's firm link is lost with the column; before Slice 1c
-- ships none can exist, because nothing in the code writes one.
--
-- Rehearsed on a throwaway Postgres; it leaves the schema identical to the
-- base commit. In production the undo goes through the forward compensating
-- migration kept in prisma/compensating/, applied by `prisma migrate deploy`,
-- never `prisma migrate resolve --rolled-back` (Prisma refuses that for a
-- migration that finished).

ALTER TABLE "ClaimAnalysisBatch" DROP CONSTRAINT IF EXISTS "claim_batch_source_org";

ALTER TABLE "ClaimAnalysisBatch" DROP CONSTRAINT IF EXISTS "ClaimAnalysisBatch_organizationId_fkey";

DROP INDEX IF EXISTS "ClaimAnalysis_batchId_googleDriveFileId_key";

DROP INDEX IF EXISTS "ClaimAnalysisBatch_organizationId_idx";

ALTER TABLE "ClaimAnalysisBatch" DROP COLUMN IF EXISTS "organizationId",
DROP COLUMN IF EXISTS "source";

DROP TYPE IF EXISTS "ClaimDriveSource";
