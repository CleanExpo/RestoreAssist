-- RA-7001 — make m² the canonical affected-area unit.
--
-- Two-step, additive + idempotent + deploy-safe (prisma migrate deploy):
--   1. AffectedArea.affectedAreaSqm — NEW nullable m² column (canonical unit).
--   2. Backfill it from the legacy sq-ft column using the exact factor
--      1 sq ft = 0.09290304 m². Only fills rows that have a legacy value and
--      no metric value yet, so a replay is a no-op.
--
-- The legacy affectedSquareFootage column is intentionally KEPT (deprecated):
-- the internal IICRC scoring engine still consumes sq ft, and retaining it
-- lets a follow-up re-backfill if any legacy rows are found to have been
-- captured in m² rather than sq ft. No column is altered or dropped here.
-- Nullable with no DEFAULT, so ADD COLUMN cannot fail on existing rows.

ALTER TABLE "AffectedArea" ADD COLUMN IF NOT EXISTS "affectedAreaSqm" DOUBLE PRECISION;

UPDATE "AffectedArea"
SET "affectedAreaSqm" = "affectedSquareFootage" * 0.09290304
WHERE "affectedSquareFootage" IS NOT NULL
  AND "affectedAreaSqm" IS NULL;
