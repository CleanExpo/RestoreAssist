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
--     (NOT created in this hotfix — see end of file for rationale)
--
-- Scope (narrow on purpose):
--   ✓ Creates 6 enums + 5 columns required by PR #959's schema.prisma
--   ✗ Does NOT create 3 phase1 tables (no Prisma models declared anywhere;
--     creating them without models leaves the (prisma as any) runtime bug
--     unchanged)
--   ✗ Does NOT repair the 7 OTHER corrupt _prisma_migrations rows discovered
--     during review (phase2-5 NIR, prompt_experiments, content_automation,
--     support_tickets, ascora_drnrpg_drying_goal) — tracked separately.
--
-- MeterType enum is deliberately EXCLUDED. PR #959 drops both the MeterType
-- enum and MoistureReading.meterType column from sandbox (the column is text
-- on prod and also gets dropped). Re-creating MeterType here would re-introduce
-- drift schema.prisma no longer declares.
--
-- This migration is fully idempotent. Sandbox (already aligned to schema.prisma)
-- is a no-op. Production gains the 6 enums + 5 columns.

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

-- ─── Tables NOT created here (intentional narrowing per reviewer C1) ──────────
--
-- The original phase1 migration also creates WaterDamageClassification,
-- PsychrometricReading, and CircuitAssessment. Those tables are deliberately
-- EXCLUDED from this hotfix because:
--   1. schema.prisma has no model declarations for them (both this branch and
--      PR #959 leave them un-modelled).
--   2. The routes that access them use `(prisma as any).circuitAssessment.*` —
--      creating just the DB tables wouldn't fix the runtime undefined-model
--      errors. The Prisma client still has no property for them.
--   3. Without the models, this PR would do half a fix and leave the routes
--      500-ing in a different way.
--
-- Tracked separately for atomic table+model fix: GitHub issue (link in PR body).
-- This narrows the PR to exactly what unblocks PR #959 — the 6 enums + the
-- 5 columns it declares.
