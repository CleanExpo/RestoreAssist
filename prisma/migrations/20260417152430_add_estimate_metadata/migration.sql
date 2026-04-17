-- RA-876: Add metadata JSON blob to Estimate for dismissed-warnings + future per-estimate state
ALTER TABLE "Estimate" ADD COLUMN "metadata" TEXT;

