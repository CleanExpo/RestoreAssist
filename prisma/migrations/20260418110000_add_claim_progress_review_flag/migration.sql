-- RA-1395 (Board M-20 + Principal amendment): manager-review-flag on ClaimProgress.
-- Raised when a row was created by the backfill cron (vs normal init flow) so
-- a manager confirms the inferred state in 1-click before it's canonical.

ALTER TABLE "ClaimProgress" ADD COLUMN "managerReviewRequired"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClaimProgress" ADD COLUMN "managerReviewRequiredAt" TIMESTAMP(3);
ALTER TABLE "ClaimProgress" ADD COLUMN "managerReviewedByUserId" TEXT;
ALTER TABLE "ClaimProgress" ADD COLUMN "managerReviewedAt"       TIMESTAMP(3);

CREATE INDEX "ClaimProgress_managerReviewRequired_idx" ON "ClaimProgress"("managerReviewRequired");
