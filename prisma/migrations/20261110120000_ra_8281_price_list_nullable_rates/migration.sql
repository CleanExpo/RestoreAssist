-- RA-8281 items 1 and 4: a price list may leave a rate unset.
--
-- WHY
--   A rate the contractor has not set must read "rate not set" and block the
--   estimate total, never price at $0 or at an NRPG midpoint. The 23 base rate
--   columns were NOT NULL, so a new price list had to be seeded with numbers
--   the contractor never chose. The 16 fire and contents fields had no column,
--   so the fire scope could not price those lines at all.
--
-- WHAT IT CHANGES
--   1. DROP NOT NULL on the 23 base rate columns in "CompanyPricingConfig" and
--      "OrganizationPricingConfig". Existing values are untouched.
--   2. ADD 16 nullable DOUBLE PRECISION columns to both tables. New rows and
--      existing rows read NULL ("rate not set").
--
-- ADDITIVE
--   No DROP, no data rewrite, no default. ALTER COLUMN ... DROP NOT NULL and
--   ADD COLUMN without a default are metadata-only in Postgres (no table rewrite).
--   RLS on both tables is unchanged.
--
-- REVERSIBLE
--   See the PR body for the rollback SQL (backfill rule, then SET NOT NULL and
--   DROP COLUMN). Not applied anywhere; applying to production is the owner's step.

-- CompanyPricingConfig: base rates may be unset
ALTER TABLE "CompanyPricingConfig"
  ALTER COLUMN "masterQualifiedNormalHours" DROP NOT NULL,
  ALTER COLUMN "masterQualifiedSaturday" DROP NOT NULL,
  ALTER COLUMN "masterQualifiedSunday" DROP NOT NULL,
  ALTER COLUMN "qualifiedTechnicianNormalHours" DROP NOT NULL,
  ALTER COLUMN "qualifiedTechnicianSaturday" DROP NOT NULL,
  ALTER COLUMN "qualifiedTechnicianSunday" DROP NOT NULL,
  ALTER COLUMN "labourerNormalHours" DROP NOT NULL,
  ALTER COLUMN "labourerSaturday" DROP NOT NULL,
  ALTER COLUMN "labourerSunday" DROP NOT NULL,
  ALTER COLUMN "airMoverAxialDailyRate" DROP NOT NULL,
  ALTER COLUMN "airMoverCentrifugalDailyRate" DROP NOT NULL,
  ALTER COLUMN "dehumidifierLGRDailyRate" DROP NOT NULL,
  ALTER COLUMN "dehumidifierDesiccantDailyRate" DROP NOT NULL,
  ALTER COLUMN "afdUnitLargeDailyRate" DROP NOT NULL,
  ALTER COLUMN "extractionTruckMountedHourlyRate" DROP NOT NULL,
  ALTER COLUMN "extractionElectricHourlyRate" DROP NOT NULL,
  ALTER COLUMN "injectionDryingSystemDailyRate" DROP NOT NULL,
  ALTER COLUMN "antimicrobialTreatmentRate" DROP NOT NULL,
  ALTER COLUMN "mouldRemediationTreatmentRate" DROP NOT NULL,
  ALTER COLUMN "biohazardTreatmentRate" DROP NOT NULL,
  ALTER COLUMN "administrationFee" DROP NOT NULL,
  ALTER COLUMN "callOutFee" DROP NOT NULL,
  ALTER COLUMN "thermalCameraUseCostPerAssessment" DROP NOT NULL;

-- CompanyPricingConfig: fire and contents price-list fields
ALTER TABLE "CompanyPricingConfig"
  ADD COLUMN "rateFireRestoration" DOUBLE PRECISION,
  ADD COLUMN "rateOzoneGenerator" DOUBLE PRECISION,
  ADD COLUMN "rateHydroxylUnit" DOUBLE PRECISION,
  ADD COLUMN "rateContentsClean" DOUBLE PRECISION,
  ADD COLUMN "rateFireEnzymeAdditionalPass" DOUBLE PRECISION,
  ADD COLUMN "rateFireSolventClean" DOUBLE PRECISION,
  ADD COLUMN "rateFireDeodorisation" DOUBLE PRECISION,
  ADD COLUMN "rateFireWallCeilingWash" DOUBLE PRECISION,
  ADD COLUMN "rateFireWindowTrackClean" DOUBLE PRECISION,
  ADD COLUMN "rateFireCupboardBenchClean" DOUBLE PRECISION,
  ADD COLUMN "rateCarpetClean" DOUBLE PRECISION,
  ADD COLUMN "rateSoftFurnishingClean" DOUBLE PRECISION,
  ADD COLUMN "rateHvacDuctClean" DOUBLE PRECISION,
  ADD COLUMN "rateLightFittingClean" DOUBLE PRECISION,
  ADD COLUMN "rateStructuralAssessment" DOUBLE PRECISION,
  ADD COLUMN "rateFireDebrisRemoval" DOUBLE PRECISION;

-- OrganizationPricingConfig: base rates may be unset
ALTER TABLE "OrganizationPricingConfig"
  ALTER COLUMN "masterQualifiedNormalHours" DROP NOT NULL,
  ALTER COLUMN "masterQualifiedSaturday" DROP NOT NULL,
  ALTER COLUMN "masterQualifiedSunday" DROP NOT NULL,
  ALTER COLUMN "qualifiedTechnicianNormalHours" DROP NOT NULL,
  ALTER COLUMN "qualifiedTechnicianSaturday" DROP NOT NULL,
  ALTER COLUMN "qualifiedTechnicianSunday" DROP NOT NULL,
  ALTER COLUMN "labourerNormalHours" DROP NOT NULL,
  ALTER COLUMN "labourerSaturday" DROP NOT NULL,
  ALTER COLUMN "labourerSunday" DROP NOT NULL,
  ALTER COLUMN "airMoverAxialDailyRate" DROP NOT NULL,
  ALTER COLUMN "airMoverCentrifugalDailyRate" DROP NOT NULL,
  ALTER COLUMN "dehumidifierLGRDailyRate" DROP NOT NULL,
  ALTER COLUMN "dehumidifierDesiccantDailyRate" DROP NOT NULL,
  ALTER COLUMN "afdUnitLargeDailyRate" DROP NOT NULL,
  ALTER COLUMN "extractionTruckMountedHourlyRate" DROP NOT NULL,
  ALTER COLUMN "extractionElectricHourlyRate" DROP NOT NULL,
  ALTER COLUMN "injectionDryingSystemDailyRate" DROP NOT NULL,
  ALTER COLUMN "antimicrobialTreatmentRate" DROP NOT NULL,
  ALTER COLUMN "mouldRemediationTreatmentRate" DROP NOT NULL,
  ALTER COLUMN "biohazardTreatmentRate" DROP NOT NULL,
  ALTER COLUMN "administrationFee" DROP NOT NULL,
  ALTER COLUMN "callOutFee" DROP NOT NULL,
  ALTER COLUMN "thermalCameraUseCostPerAssessment" DROP NOT NULL;

-- OrganizationPricingConfig: fire and contents price-list fields
ALTER TABLE "OrganizationPricingConfig"
  ADD COLUMN "rateFireRestoration" DOUBLE PRECISION,
  ADD COLUMN "rateOzoneGenerator" DOUBLE PRECISION,
  ADD COLUMN "rateHydroxylUnit" DOUBLE PRECISION,
  ADD COLUMN "rateContentsClean" DOUBLE PRECISION,
  ADD COLUMN "rateFireEnzymeAdditionalPass" DOUBLE PRECISION,
  ADD COLUMN "rateFireSolventClean" DOUBLE PRECISION,
  ADD COLUMN "rateFireDeodorisation" DOUBLE PRECISION,
  ADD COLUMN "rateFireWallCeilingWash" DOUBLE PRECISION,
  ADD COLUMN "rateFireWindowTrackClean" DOUBLE PRECISION,
  ADD COLUMN "rateFireCupboardBenchClean" DOUBLE PRECISION,
  ADD COLUMN "rateCarpetClean" DOUBLE PRECISION,
  ADD COLUMN "rateSoftFurnishingClean" DOUBLE PRECISION,
  ADD COLUMN "rateHvacDuctClean" DOUBLE PRECISION,
  ADD COLUMN "rateLightFittingClean" DOUBLE PRECISION,
  ADD COLUMN "rateStructuralAssessment" DOUBLE PRECISION,
  ADD COLUMN "rateFireDebrisRemoval" DOUBLE PRECISION;
