-- D-021: make the organisation the authoritative AU/NZ locale and
-- jurisdiction-appropriate business-identity source.
ALTER TABLE "Organization"
ADD COLUMN "nzbn" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney';

UPDATE "Organization"
SET "timezone" = 'Pacific/Auckland'
WHERE "country" = 'NZ';

ALTER TABLE "Organization"
ADD CONSTRAINT "Organization_country_anz_check"
CHECK ("country" IN ('AU', 'NZ'));

CREATE UNIQUE INDEX "Organization_nzbn_key" ON "Organization"("nzbn");
