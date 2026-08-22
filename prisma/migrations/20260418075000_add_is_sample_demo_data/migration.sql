-- RA-1239: isSample flag on Client + Report so we can seed demo data for
-- new trial users and let them clear it in one click. Additive columns
-- with DEFAULT false, so zero impact on existing rows.

ALTER TABLE "Client" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Report" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Client_userId_isSample_idx" ON "Client"("userId", "isSample");
CREATE INDEX "Report_userId_isSample_idx" ON "Report"("userId", "isSample");
