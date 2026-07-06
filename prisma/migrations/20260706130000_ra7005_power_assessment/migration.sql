-- RA-7005: mandatory initial site power assessment on Inspection.
-- Nullable/backfill-safe: existing rows keep NULL circuits (planner assumes
-- 2x20A, completeness gate flags absence); deratePct defaults to 0.8 (AS/NZS
-- 3000 continuous-load best practice). Additive, idempotent.
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "powerCircuits" INTEGER;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "powerCircuitRatingA" INTEGER;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "powerDeratePct" DOUBLE PRECISION DEFAULT 0.8;
