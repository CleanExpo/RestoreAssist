-- Migration: add_orphan_table_models
-- Date: 2026-05-13
-- Issue: #963 — atomic table + Prisma model fix for the 3 orphan tables.
--
-- HISTORY
-- ───────
-- The original 20260330500000_add_nir_water_damage_phase1 migration declared
-- 3 tables (WaterDamageClassification, PsychrometricReading, CircuitAssessment).
-- That migration was recorded as applied in prod with applied_steps_count: 0
-- — DDL never ran. PR #960 hotfix DELIBERATELY EXCLUDED these 3 tables because
-- schema.prisma had no model declarations and creating DB tables without
-- models would leave the (prisma as any).<tableName>.* routes broken in a
-- different way (TypeError instead of "table doesn't exist").
--
-- This migration is the issue #963 follow-up: schema.prisma now declares all
-- 3 models (this PR), and this migration creates the DB tables atomically.
--
-- Sandbox state at time of write: tables already exist (from earlier manual
-- repair work in the 2026-05-13 schema-drift session). DDL below is fully
-- idempotent — sandbox is a no-op, prod gains the 3 tables.

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
