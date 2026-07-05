-- RA-7001: correct the DryingGoalRecord.iicrcReference column default.
-- The prior default stamped a fabricated citation ("IICRC S500:2025 §11.4" in
-- the Prisma schema; "IICRC S500:2021 §11.4" in the DB) onto every new drying-goal
-- record. Replace it with a verified, topically-correct citation:
-- ANSI/IICRC S500:2021 §12.5.7 (Verifying Drying Goals). Additive, non-destructive.
ALTER TABLE "DryingGoalRecord"
  ALTER COLUMN "iicrcReference" SET DEFAULT 'IICRC S500:2021 §12.5.7';
