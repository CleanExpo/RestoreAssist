-- RA-261: NIR Full Data Depth Matrix — Phase 1: Water Damage
-- Adds enums, extends MoistureReading + ScopeItem, adds 3 new models

-- ─── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "ClaimType" AS ENUM (
  'WATER', 'FIRE', 'MOULD', 'STORM', 'CONTENTS',
  'BIOHAZARD', 'ODOUR', 'CARPET', 'HVAC', 'ASBESTOS'
);

CREATE TYPE "WaterCategory" AS ENUM ('CAT_1', 'CAT_2', 'CAT_3');

CREATE TYPE "DamageClass" AS ENUM ('CLASS_1', 'CLASS_2', 'CLASS_3', 'CLASS_4');

CREATE TYPE "LossSourceType" AS ENUM (
  'PLUMBING', 'ROOF', 'APPLIANCE', 'FLOOD',
  'GROUNDWATER', 'CONDENSATION', 'HVAC', 'UNKNOWN'
);

CREATE TYPE "MeterType" AS ENUM ('PIN', 'PINLESS', 'CALCIUM_CHLORIDE');

CREATE TYPE "ScopeUnit" AS ENUM ('M2', 'LM', 'EACH', 'DAY', 'HOUR', 'LITRE');

CREATE TYPE "ScopeCategory" AS ENUM (
  'EXTRACTION', 'STRUCTURAL_DRYING', 'EQUIPMENT', 'ANTIMICROBIAL',
  'MONITORING', 'CONTENTS', 'HVAC', 'ODOUR'
);

-- ─── Inspection: add claimType ─────────────────────────────────────────────────

ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "claimType" "ClaimType";

-- ─── MoistureReading: add meter & drying goal fields ──────────────────────────

ALTER TABLE "MoistureReading"
  ADD COLUMN IF NOT EXISTS "meterType"          "MeterType",
  ADD COLUMN IF NOT EXISTS "meterModel"         TEXT,
  ADD COLUMN IF NOT EXISTS "targetEMC"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dryingGoalAchieved" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "MoistureReading_dryingGoalAchieved_idx"
  ON "MoistureReading"("dryingGoalAchieved");

-- ─── ScopeItem: add pricing & compliance metadata ─────────────────────────────

ALTER TABLE "ScopeItem"
  ADD COLUMN IF NOT EXISTS "code"              TEXT,
  ADD COLUMN IF NOT EXISTS "scopeCategory"     "ScopeCategory",
  ADD COLUMN IF NOT EXISTS "iicrcStandard"     TEXT,
  ADD COLUMN IF NOT EXISTS "scopeUnit"         "ScopeUnit",
  ADD COLUMN IF NOT EXISTS "auUnitPrice"       DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "acceptedByInsurer" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "acceptanceRate"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "claimType"         "ClaimType",
  ADD COLUMN IF NOT EXISTS "lastPriceUpdate"   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "ScopeItem_claimType_idx"    ON "ScopeItem"("claimType");
CREATE INDEX IF NOT EXISTS "ScopeItem_scopeCategory_idx" ON "ScopeItem"("scopeCategory");

-- ─── WaterDamageClassification ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WaterDamageClassification" (
  "id"                          TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"                TEXT          NOT NULL UNIQUE,
  "waterCategory"               "WaterCategory",
  "damageClass"                 "DamageClass",
  "lossSourceType"              "LossSourceType",
  "lossSourceIdentified"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "lossSourceAddressed"         BOOLEAN       NOT NULL DEFAULT FALSE,
  "hoursOfExposure"             DOUBLE PRECISION,
  "gateClassificationComplete"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "gateLossSourceComplete"      BOOLEAN       NOT NULL DEFAULT FALSE,
  "gatePhotosAttached"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "WaterDamageClassification_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "WaterDamageClassification_inspectionId_idx"
  ON "WaterDamageClassification"("inspectionId");
CREATE INDEX IF NOT EXISTS "WaterDamageClassification_waterCategory_idx"
  ON "WaterDamageClassification"("waterCategory");
CREATE INDEX IF NOT EXISTS "WaterDamageClassification_damageClass_idx"
  ON "WaterDamageClassification"("damageClass");

-- ─── PsychrometricReading ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PsychrometricReading" (
  "id"               TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"     TEXT          NOT NULL,
  "visitDate"        TIMESTAMPTZ   NOT NULL,
  "visitNumber"      INTEGER       NOT NULL,
  "technicianId"     TEXT,
  "dryBulbTempC"     DOUBLE PRECISION,
  "wetBulbTempC"     DOUBLE PRECISION,
  "relativeHumidity" DOUBLE PRECISION,
  "dewPointC"        DOUBLE PRECISION,
  "grainsPerPound"   DOUBLE PRECISION,
  "gramsPerKilogram" DOUBLE PRECISION,
  "equipmentRunning" BOOLEAN       NOT NULL DEFAULT TRUE,
  "notes"            TEXT,
  "createdAt"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "PsychrometricReading_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PsychrometricReading_inspectionId_idx"
  ON "PsychrometricReading"("inspectionId");
CREATE INDEX IF NOT EXISTS "PsychrometricReading_visitDate_idx"
  ON "PsychrometricReading"("visitDate");
CREATE INDEX IF NOT EXISTS "PsychrometricReading_visitNumber_idx"
  ON "PsychrometricReading"("visitNumber");

-- ─── CircuitAssessment ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CircuitAssessment" (
  "id"                   TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "inspectionId"         TEXT          NOT NULL,
  "circuitId"            TEXT          NOT NULL,
  "locationZone"         TEXT          NOT NULL,
  "equipmentList"        JSONB         NOT NULL DEFAULT '[]',
  "circuitBreakerRating" INTEGER       NOT NULL,
  "rcdProtected"         BOOLEAN       NOT NULL DEFAULT FALSE,
  "extensionCordGauge"   TEXT,
  "totalCircuitLoad"     DOUBLE PRECISION,
  "circuitLoadSafe"      BOOLEAN,
  "circuitLoadWarning"   TEXT,
  "createdAt"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "CircuitAssessment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CircuitAssessment_inspectionId_idx"
  ON "CircuitAssessment"("inspectionId");
CREATE INDEX IF NOT EXISTS "CircuitAssessment_circuitLoadSafe_idx"
  ON "CircuitAssessment"("circuitLoadSafe");
