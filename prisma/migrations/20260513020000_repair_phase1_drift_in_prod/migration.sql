-- Migration: repair_phase1_drift_in_prod
-- Date: 2026-05-13
-- Issue: RA-CLAUDE-md-rule-16 (drift recovery)
--
-- HISTORY OF THE INCIDENT
-- ───────────────────────
-- 5 migrations were recorded in production's `_prisma_migrations` table with
-- `applied_steps_count: 0` — meaning Prisma marked them as applied without
-- actually executing their DDL. The likely cause is someone ran
-- `prisma migrate resolve --applied` over a failed `migrate deploy`, papering
-- over the failure instead of resolving it.
--
-- Affected migrations:
--   20260330000000_add_moisture_map_coords            (mapX, mapY)
--   20260330100000_add_inspection_esignature          (signatureUrl, signedAt, signedByName)
--   20260330300000_add_inspection_loss_description    (lossDescription)
--   20260330400000_add_generated_narrative            (generatedNarrative)
--   20260330500000_add_nir_water_damage_phase1        (7 enums + Inspection.claimType + 3 tables)
--
-- Production state at time of repair (verified via information_schema):
--   • signatureUrl, signedAt, signedByName — already present (some other path)
--   • ScopeItem.{code,scopeCategory,...} (9 cols) — already present (as TEXT, not enum)
--   • 7 enums all MISSING (6 re-created here; MeterType excluded — see below)
--   • Inspection.{claimType,lossDescription,generatedNarrative} — MISSING
--   • MoistureReading.{mapX,mapY} — MISSING
--   • Tables WaterDamageClassification, PsychrometricReading, CircuitAssessment — MISSING
--
-- MeterType enum is deliberately EXCLUDED. PR #959 drops both the MeterType
-- enum and MoistureReading.meterType column from sandbox (the column is text
-- on prod and also gets dropped). Re-creating MeterType here would re-introduce
-- drift schema.prisma no longer declares.
--
-- This migration is fully idempotent. Sandbox (already aligned to schema.prisma)
-- is a no-op. Production gains the missing objects.
--
-- Out of scope (separate follow-up): converting ScopeItem.{claimType,scopeCategory,scopeUnit}
-- from TEXT to enum types in prod — needs a data audit and is outside the
-- "make PR #959 mergeable" goal.

-- ─── Enums (DO $$ guards because Postgres has no CREATE TYPE IF NOT EXISTS) ────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimType') THEN
    CREATE TYPE "ClaimType" AS ENUM (
      'WATER', 'FIRE', 'MOULD', 'STORM', 'CONTENTS',
      'BIOHAZARD', 'ODOUR', 'CARPET', 'HVAC', 'ASBESTOS'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WaterCategory') THEN
    CREATE TYPE "WaterCategory" AS ENUM ('CAT_1', 'CAT_2', 'CAT_3');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DamageClass') THEN
    CREATE TYPE "DamageClass" AS ENUM ('CLASS_1', 'CLASS_2', 'CLASS_3', 'CLASS_4');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LossSourceType') THEN
    CREATE TYPE "LossSourceType" AS ENUM (
      'PLUMBING', 'ROOF', 'APPLIANCE', 'FLOOD',
      'GROUNDWATER', 'CONDENSATION', 'HVAC', 'UNKNOWN'
    );
  END IF;
END $$;

-- MeterType deliberately excluded — PR #959 drops it. The phase1 migration
-- originally created it for MoistureReading.meterType (also dropped by #959).
-- Re-creating here would re-introduce drift schema.prisma no longer declares.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScopeUnit') THEN
    CREATE TYPE "ScopeUnit" AS ENUM ('M2', 'LM', 'EACH', 'DAY', 'HOUR', 'LITRE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScopeCategory') THEN
    CREATE TYPE "ScopeCategory" AS ENUM (
      'EXTRACTION', 'STRUCTURAL_DRYING', 'EQUIPMENT', 'ANTIMICROBIAL',
      'MONITORING', 'CONTENTS', 'HVAC', 'ODOUR'
    );
  END IF;
END $$;

-- ─── Inspection: add the 3 missing columns ────────────────────────────────────

ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "claimType"          "ClaimType",
  ADD COLUMN IF NOT EXISTS "lossDescription"    TEXT,
  ADD COLUMN IF NOT EXISTS "generatedNarrative" TEXT;

-- ─── MoistureReading: add the 2 missing coordinate columns ────────────────────

ALTER TABLE "MoistureReading"
  ADD COLUMN IF NOT EXISTS "mapX" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mapY" DOUBLE PRECISION;

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
