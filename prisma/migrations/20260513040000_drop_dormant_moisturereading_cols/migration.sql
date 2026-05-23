-- Migration: drop_dormant_moisturereading_cols
-- Date: 2026-05-13
-- Issue: #969 — MoistureReading extra-in-DB drift cleanup
--
-- HISTORY
-- ───────
-- Prod MoistureReading carries 14 columns that don't exist on sandbox or in
-- schema.prisma. Discovered during PR #959 / #960 / #963 schema-drift work.
--
-- Per-column audit (verified via grep across app/ + lib/ + components/):
--   • roomId             — zero typed Prisma refs (sandbox = absent)
--   • meterId            — zero typed Prisma refs
--   • recordedBy         — zero typed Prisma refs
--   • ambientTempC       — zero typed Prisma refs
--   • ambientRH          — zero typed Prisma refs
--   • materialType       — only as TypeScript type-alias key in
--                          `lib/nir-bluetooth-service.ts` (BLE reading
--                          shape), not a MoistureReading Prisma column
--   • emcTarget          — zero typed Prisma refs (drying-goal logic lives
--                          on the separate DryingGoalRecord table)
--   • mobileLocalId      — zero typed Prisma refs
--   • metadata (jsonb)   — zero typed Prisma refs
--   • timestamp          — only as output-key in unrelated routes
--   • latitude / longitude — only as keys on MediaAsset (different table)
--   • meterSerial        — zero typed Prisma refs
--   • calibrationDate    — zero typed Prisma refs
--
-- Pre-flight verification (Supabase MCP against udooysjajglluvuxkijp on
-- 2026-05-13): `SELECT COUNT(*) FROM "MoistureReading"` returned 0 rows.
-- Zero data-loss risk on DROP.
--
-- Sandbox has none of these columns (verified). This migration brings prod
-- into alignment with sandbox + schema.prisma. Fully idempotent —
-- IF EXISTS guards on every DROP.

ALTER TABLE "MoistureReading"
  DROP COLUMN IF EXISTS "roomId",
  DROP COLUMN IF EXISTS "meterId",
  DROP COLUMN IF EXISTS "recordedBy",
  DROP COLUMN IF EXISTS "ambientTempC",
  DROP COLUMN IF EXISTS "ambientRH",
  DROP COLUMN IF EXISTS "materialType",
  DROP COLUMN IF EXISTS "emcTarget",
  DROP COLUMN IF EXISTS "mobileLocalId",
  DROP COLUMN IF EXISTS "metadata",
  DROP COLUMN IF EXISTS "timestamp",
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "meterSerial",
  DROP COLUMN IF EXISTS "calibrationDate";
