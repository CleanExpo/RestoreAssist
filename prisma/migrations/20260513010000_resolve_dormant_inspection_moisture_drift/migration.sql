-- ============================================================================
-- Resolve dormant column drift on Inspection + MoistureReading
-- ============================================================================
--
-- Audit summary (sandbox project oxeiaavuspvpvanzcrjc, 2026-05-13):
--   12 dormant columns identified — columns present in the DB but absent from
--   prisma/schema.prisma. Each column was triaged by grepping the codebase for
--   Prisma-typed access (prisma.<model>.<op>({ data|select|where: { <col> } })).
--
-- Decision: MIXED. 8 columns are in active Prisma use (currently slipping past
-- the type system via `as any` casts) → DECLARE in schema, NO DDL needed
-- (columns already exist in DB). 4 columns have zero Prisma-typed use → DROP.
--
-- Per-column rationale:
--
--   Inspection (6 — all KEEP, declared in schema this commit)
--   ────────────────────────────────────────────────────────
--   claimType            ClaimType?       used by app/api/inspections/[id]/{carpet,
--                                         biohazard,hvac,fire-smoke,storm,mould-
--                                         remediation,contents-pack-out,water-
--                                         damage-classification}/route.ts
--   signatureUrl         TEXT             app/api/inspections/[id]/sign/route.ts
--   signedAt             TIMESTAMPTZ      same
--   signedByName         TEXT             same
--   lossDescription      TEXT             app/api/inspections/route.ts,
--                                         app/api/inspections/[id]/route.ts (PATCH),
--                                         pilot-tester/*, similar-jobs route
--   generatedNarrative   TEXT             app/api/inspections/[id]/generate-scope/route.ts
--
--   MoistureReading (2 KEEP / 4 DROP)
--   ──────────────────────────────────
--   mapX                 DOUBLE PRECISION KEEP — app/api/inspections/[id]/moisture/route.ts
--                                         (floor-plan placement, normalised 0..1)
--   mapY                 DOUBLE PRECISION KEEP — same
--   meterType            "MeterType"      DROP — only UI-state references in
--                                         components/inspection/MoistureReadingEntry
--                                         Form.tsx + components/mobile/QuickMoisture
--                                         Entry.tsx (client sends it, API silently
--                                         drops it; never written to DB).
--   meterModel           TEXT             DROP — zero references in repo.
--   targetEMC            DOUBLE PRECISION DROP — zero references in repo. Drying-
--                                         goal data is stored on DryingGoalRecord
--                                         instead (table created in the same
--                                         RA-261 migration).
--   dryingGoalAchieved   BOOLEAN          DROP — only as a *computed response
--                                         field* on app/api/inspections/[id]/
--                                         psychrometric/route.ts; never read
--                                         from / written to this column. Drying-
--                                         goal state lives on DryingGoalRecord.
--
-- Backup: SELECT id, "inspectionId", "meterType"::text, "meterModel",
--   "targetEMC", "dryingGoalAchieved", "recordedAt" FROM "MoistureReading"
--   WHERE "meterType" IS NOT NULL OR "meterModel" IS NOT NULL
--      OR "targetEMC" IS NOT NULL OR "dryingGoalAchieved" = TRUE;
-- → Captured 2026-05-13 against sandbox project oxeiaavuspvpvanzcrjc via
--   Supabase MCP execute_sql. Result: zero rows. Sandbox MoistureReading
--   total row count: 0. No data loss risk.
--
--   Production (udooysjajglluvuxkijp) MUST run the same backup query and
--   capture results to /tmp/moisturereading-dormant-backup-2026-05-13.csv
--   before this migration is promoted out of sandbox. If non-zero rows are
--   returned, STOP and triage.
--
-- Idempotency: all DROPs use IF EXISTS so re-running the migration on a DB
-- that already cleared the columns is a no-op.
--
-- Index cleanup: drops MoistureReading_dryingGoalAchieved_idx created by
-- migration 20260330500000_add_nir_water_damage_phase1.
--
-- Type cleanup: drops the "MeterType" enum after its only column user
-- (MoistureReading.meterType) is gone. Verified via information_schema.columns
-- that no other column references "MeterType" in sandbox.
-- ============================================================================

-- 1. Drop the index that targeted the dropped boolean.
DROP INDEX IF EXISTS "MoistureReading_dryingGoalAchieved_idx";

-- 2. Drop the four dormant MoistureReading columns.
ALTER TABLE "MoistureReading"
  DROP COLUMN IF EXISTS "meterType",
  DROP COLUMN IF EXISTS "meterModel",
  DROP COLUMN IF EXISTS "targetEMC",
  DROP COLUMN IF EXISTS "dryingGoalAchieved";

-- 3. Drop the MeterType enum type now that nothing references it.
DROP TYPE IF EXISTS "MeterType";
