-- Migration: repair_nir_phase2_5_drift
-- Date: 2026-05-13
-- Issue: #962 — atomic table + Prisma model fix for 8 NIR phase 2–5 orphans.
--
-- HISTORY
-- ───────
-- 3 migrations were recorded in production's `_prisma_migrations` table with
-- `applied_steps_count: 0` — Prisma marked them as applied without executing
-- their DDL. Likely cause: `prisma migrate resolve --applied` over a failed
-- `migrate deploy`, papering over the failure.
--
-- Affected migrations whose DDL is re-applied here:
--   20260330600000_add_nir_fire_mould_phase2_3  →
--       FireSmokeDamageAssessment, MouldRemediationAssessment,
--       ContentsPackOutItem, + 6 enums
--   20260330700000_add_nir_storm_biohazard_carpet_phase4  →
--       StormDamageAssessment, BiohazardAssessment,
--       CarpetRestorationAssessment, + 8 enums
--   20260330800000_add_nir_hvac_au_compliance_phase5  →
--       HVACAssessment, AustralianComplianceRecord, + 4 enums
--
-- Pattern: same as #960/#965 (phase 1 repair). schema.prisma now declares
-- all 8 models + 18 enums (this PR), and this migration creates the DB
-- objects atomically. Routes that were using `(prisma as any).*` casts to
-- bypass the missing models are switched to typed access in the same PR.
--
-- Sandbox state at time of write: tables + enums already exist (the original
-- phase 2/3/4/5 migrations applied successfully there in 2026-03). DDL below
-- is fully idempotent — sandbox is a no-op, prod gains everything.

-- ─── Enums (DO $$ guards because Postgres has no CREATE TYPE IF NOT EXISTS) ────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StructuralStability') THEN
    CREATE TYPE "StructuralStability" AS ENUM ('SAFE', 'UNCERTAIN', 'COMPROMISED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SmokeResidueType') THEN
    CREATE TYPE "SmokeResidueType" AS ENUM ('WET', 'DRY', 'PROTEIN', 'FUEL_OIL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OdourType') THEN
    CREATE TYPE "OdourType" AS ENUM ('SMOKE', 'PROTEIN', 'CHEMICAL', 'FUEL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PackOutDecision') THEN
    CREATE TYPE "PackOutDecision" AS ENUM ('CLEAN_ONSITE', 'PACK_OUT', 'TOTAL_LOSS');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConditionGrade') THEN
    CREATE TYPE "ConditionGrade" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MouldConditionLevel') THEN
    CREATE TYPE "MouldConditionLevel" AS ENUM ('CONDITION_1', 'CONDITION_2', 'CONDITION_3');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StormEventType') THEN
    CREATE TYPE "StormEventType" AS ENUM ('STORM', 'CYCLONE', 'HAIL', 'DOWNBURST', 'TORNADO');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DamagePenetration') THEN
    CREATE TYPE "DamagePenetration" AS ENUM ('SURFACE', 'PARTIAL', 'FULL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoofMaterialType') THEN
    CREATE TYPE "RoofMaterialType" AS ENUM ('COLORBOND', 'TERRACOTTA', 'SHINGLES', 'METAL', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BiohazardType') THEN
    CREATE TYPE "BiohazardType" AS ENUM (
      'SEWAGE_CAT3', 'BLOOD', 'BODILY_FLUIDS', 'CRIME_SCENE', 'UNATTENDED_DEATH'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PPELevel') THEN
    CREATE TYPE "PPELevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CarpetFiberType') THEN
    CREATE TYPE "CarpetFiberType" AS ENUM ('WOOL', 'NYLON', 'POLYESTER', 'POLYPROPYLENE', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CarpetPileType') THEN
    CREATE TYPE "CarpetPileType" AS ENUM ('CUT', 'LOOP', 'CUT_LOOP', 'FRIEZE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StainRemovalResult') THEN
    CREATE TYPE "StainRemovalResult" AS ENUM ('COMPLETE', 'PARTIAL', 'UNSUCCESSFUL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HVACContaminationLevel') THEN
    CREATE TYPE "HVACContaminationLevel" AS ENUM ('NONE', 'LIGHT', 'MODERATE', 'HEAVY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AustralianState') THEN
    CREATE TYPE "AustralianState" AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TechnicianCertification') THEN
    CREATE TYPE "TechnicianCertification" AS ENUM (
      'WRT', 'ASD', 'CMS', 'HST', 'OCT', 'CCT', 'MRS', 'OTHER'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NRPGCategory') THEN
    CREATE TYPE "NRPGCategory" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'CATASTROPHIC');
  END IF;
END $$;

-- ─── FireSmokeDamageAssessment ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "FireSmokeDamageAssessment" (
  "id"                           TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                 TEXT          NOT NULL UNIQUE,
  "structuralStability"          "StructuralStability",
  "electricalDisconnectVerified" BOOLEAN       NOT NULL DEFAULT FALSE,
  "gasShutoffVerified"           BOOLEAN       NOT NULL DEFAULT FALSE,
  "charringDepthMm"              DOUBLE PRECISION,
  "engineerClearanceRequired"    BOOLEAN       NOT NULL DEFAULT FALSE,
  "smokeResidueType"             "SmokeResidueType",
  "residueLocation"              TEXT,
  "surfacePH"                    DOUBLE PRECISION,
  "pHMeterModel"                 TEXT,
  "odourSeverityScore"           INTEGER,
  "hvacAffected"                 BOOLEAN       NOT NULL DEFAULT FALSE,
  "odourType"                    "OdourType",
  "ozoneTreatmentDuration"       DOUBLE PRECISION,
  "ozoneConcentrationPpm"        DOUBLE PRECISION,
  "evacuationOrderTimestamp"     TIMESTAMPTZ,
  "reentryApprovalTimestamp"     TIMESTAMPTZ,
  "spaceVolumeM3"                DOUBLE PRECISION,
  "gateStructuralCleared"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateElectricalCleared"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "FireSmokeDamageAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "FireSmokeDamageAssessment_inspectionId_idx"
  ON "FireSmokeDamageAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "FireSmokeDamageAssessment_structuralStability_idx"
  ON "FireSmokeDamageAssessment"("structuralStability");

-- ─── ContentsPackOutItem ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ContentsPackOutItem" (
  "id"                      TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"            TEXT          NOT NULL,
  "itemDescription"         TEXT          NOT NULL,
  "make"                    TEXT,
  "model"                   TEXT,
  "serialNumber"            TEXT,
  "ageYears"                INTEGER,
  "conditionPreLoss"        "ConditionGrade",
  "conditionPostLoss"       "ConditionGrade",
  "replacementValueAud"     DECIMAL(10,2),
  "restorationCostEstimate" DECIMAL(10,2),
  "packOutDecision"         "PackOutDecision",
  "packOutTag"              TEXT,
  "beforePhotoUrl"          TEXT,
  "afterPhotoUrl"           TEXT,
  "claimType"               "ClaimType",
  "createdAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "ContentsPackOutItem_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContentsPackOutItem_inspectionId_idx"
  ON "ContentsPackOutItem"("inspectionId");
CREATE INDEX IF NOT EXISTS "ContentsPackOutItem_packOutDecision_idx"
  ON "ContentsPackOutItem"("packOutDecision");
CREATE INDEX IF NOT EXISTS "ContentsPackOutItem_claimType_idx"
  ON "ContentsPackOutItem"("claimType");

-- ─── MouldRemediationAssessment ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MouldRemediationAssessment" (
  "id"                           TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                 TEXT          NOT NULL UNIQUE,
  "mouldConditionLevel"          "MouldConditionLevel",
  "visibleGrowthObserved"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "affectedAreaM2"               DOUBLE PRECISION,
  "moistureSourceIdentified"     BOOLEAN       NOT NULL DEFAULT FALSE,
  "rootCauseAddressed"           BOOLEAN       NOT NULL DEFAULT FALSE,
  "pressureDifferentialPa"       DOUBLE PRECISION,
  "airChangesPerHour"            DOUBLE PRECISION,
  "containmentBarrierMaterial"   TEXT,
  "negativePressureMachineModel" TEXT,
  "airSamplingRequired"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "samplingDate"                 TIMESTAMPTZ,
  "labName"                      TEXT,
  "labReportReference"           TEXT,
  "sporeType"                    TEXT,
  "sporeCountPreRemediation"     DOUBLE PRECISION,
  "outdoorBaselineCount"         DOUBLE PRECISION,
  "sporeCountPostRemediation"    DOUBLE PRECISION,
  "clearanceCriterion"           TEXT,
  "iepAssessmentRequired"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateMoistureSourceFixed"      BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateContainmentSufficient"    BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "MouldRemediationAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MouldRemediationAssessment_inspectionId_idx"
  ON "MouldRemediationAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "MouldRemediationAssessment_mouldConditionLevel_idx"
  ON "MouldRemediationAssessment"("mouldConditionLevel");

-- ─── StormDamageAssessment ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StormDamageAssessment" (
  "id"                        TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"              TEXT          NOT NULL UNIQUE,
  "bomEventReference"         TEXT,
  "windSpeedKmh"              DOUBLE PRECISION,
  "eventType"                 "StormEventType",
  "eventTimestamp"            TIMESTAMPTZ,
  "roofMaterialType"          "RoofMaterialType",
  "roofDamageAreaM2"          DOUBLE PRECISION,
  "damagePenetration"         "DamagePenetration",
  "waterIngressPoints"        TEXT,
  "engineerClearanceRequired" BOOLEAN       NOT NULL DEFAULT FALSE,
  "emergencyTarpingCompleted" BOOLEAN       NOT NULL DEFAULT FALSE,
  "emergencyTarpingM2"        DOUBLE PRECISION,
  "emergencyTarpingTimestamp" TIMESTAMPTZ,
  "waterCategory"             "WaterCategory",
  "asbestosRiskFlag"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "StormDamageAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "StormDamageAssessment_inspectionId_idx"
  ON "StormDamageAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "StormDamageAssessment_eventType_idx"
  ON "StormDamageAssessment"("eventType");

-- ─── BiohazardAssessment ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BiohazardAssessment" (
  "id"                       TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"             TEXT          NOT NULL UNIQUE,
  "biohazardType"            "BiohazardType",
  "contaminationAreaM2"      DOUBLE PRECISION,
  "atpReadingPre"            DOUBLE PRECISION,
  "atpReadingPost"           DOUBLE PRECISION,
  "swmsCompleted"            BOOLEAN       NOT NULL DEFAULT FALSE,
  "ppeLevel"                 "PPELevel",
  "wasteDisposalManifestId"  TEXT,
  "disposalFacilityLicense"  TEXT,
  "disposalCertificateUrl"   TEXT,
  "createdAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "BiohazardAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "BiohazardAssessment_inspectionId_idx"
  ON "BiohazardAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "BiohazardAssessment_biohazardType_idx"
  ON "BiohazardAssessment"("biohazardType");

-- ─── CarpetRestorationAssessment ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CarpetRestorationAssessment" (
  "id"                             TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                   TEXT          NOT NULL UNIQUE,
  "fiberType"                      "CarpetFiberType",
  "pileType"                       "CarpetPileType",
  "backingType"                    TEXT,
  "standingWaterHours"             DOUBLE PRECISION,
  "extractionRateLitresPerHour"    DOUBLE PRECISION,
  "extractionPasses"               INTEGER,
  "residualMoisturePostExtraction" DOUBLE PRECISION,
  "delaminationTestResult"         TEXT,
  "finalMoisturePercent"           DOUBLE PRECISION,
  "stainType"                      TEXT,
  "stainPH"                        DOUBLE PRECISION,
  "stainTreatmentProduct"          TEXT,
  "stainRemovalResult"             "StainRemovalResult",
  "restorationDecision"            TEXT,
  "createdAt"                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "CarpetRestorationAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CarpetRestorationAssessment_inspectionId_idx"
  ON "CarpetRestorationAssessment"("inspectionId");

-- ─── HVACAssessment ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "HVACAssessment" (
  "id"                          TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                TEXT          NOT NULL UNIQUE,
  "hvacSystemInspected"         BOOLEAN       NOT NULL DEFAULT FALSE,
  "ductContaminationLevel"      "HVACContaminationLevel",
  "visibleSootInDucts"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "smokeOdourInDucts"           BOOLEAN       NOT NULL DEFAULT FALSE,
  "filterCondition"             TEXT,
  "coilContaminationLevel"      "HVACContaminationLevel",
  "hvacCleaningRequired"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "insulationResistanceMegaohm" DOUBLE PRECISION,
  "insulationTestPerformedBy"   TEXT,
  "createdAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "HVACAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HVACAssessment_inspectionId_idx"
  ON "HVACAssessment"("inspectionId");

-- ─── AustralianComplianceRecord ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AustralianComplianceRecord" (
  "id"                        TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"              TEXT          NOT NULL UNIQUE,
  "insurerName"               TEXT,
  "claimNumber"               TEXT,
  "lossAdjusterName"          TEXT,
  "lossAdjusterReference"     TEXT,
  "nrpgCategory"              "NRPGCategory",
  "iicrcCertifiedTechnician"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "technicianCertification"   "TechnicianCertification",
  "technicianLicenseNumber"   TEXT,
  "state"                     "AustralianState",
  "propertyYearBuilt"         INTEGER,
  "asbestosRiskAcknowledged"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "friableAssessment"         TEXT,
  "workHalted"                BOOLEAN       NOT NULL DEFAULT FALSE,
  "licensedAssessorName"      TEXT,
  "licensedAssessorLicense"   TEXT,
  "removalQuoteAud"           DECIMAL(10,2),
  "separateInvoiceRequired"   BOOLEAN       NOT NULL DEFAULT TRUE,
  "createdAt"                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "AustralianComplianceRecord_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AustralianComplianceRecord_inspectionId_idx"
  ON "AustralianComplianceRecord"("inspectionId");
CREATE INDEX IF NOT EXISTS "AustralianComplianceRecord_state_idx"
  ON "AustralianComplianceRecord"("state");
CREATE INDEX IF NOT EXISTS "AustralianComplianceRecord_nrpgCategory_idx"
  ON "AustralianComplianceRecord"("nrpgCategory");
