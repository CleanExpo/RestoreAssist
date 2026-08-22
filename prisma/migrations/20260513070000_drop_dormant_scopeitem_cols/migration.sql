-- Migration: drop_dormant_scopeitem_cols
-- Date: 2026-05-13
-- Issue: #967 — ScopeItem orphan column drift cleanup
--
-- HISTORY (corrected scope vs original issue description)
-- ───────────────────────────────────────────────────────
-- Issue #967 originally described "ScopeItem 9 columns are TEXT on prod,
-- should be enum-typed". On verification (Supabase MCP queries against both
-- environments) the actual state is the OPPOSITE:
--
--   • Sandbox ScopeItem: HAS the 9 columns. `claimType`, `scopeCategory`,
--     `scopeUnit` are properly enum-typed. The other 6 are non-enum scalars.
--   • Production ScopeItem: MISSING all 9 columns entirely (the original
--     20260330500000_add_nir_water_damage_phase1 migration was marked
--     applied_steps_count: 0 — DDL never ran on prod).
--   • schema.prisma: declares NONE of the 9 columns on `model ScopeItem`.
--   • Code: ZERO typed Prisma references to any of the 9 columns across
--     `app/`, `lib/`, `components/` (verified via grep).
--
-- The 9 columns are pure orphan DDL on sandbox — no code consumer, no
-- schema declaration, no production presence. Aligning sandbox with prod +
-- schema by dropping them.
--
-- Sandbox pre-flight: ScopeItem has 0 rows. Zero data-loss risk.
-- Production no-op: columns already absent (`DROP COLUMN IF EXISTS` guards).
--
-- Enums (`ClaimType`, `ScopeCategory`, `ScopeUnit`) are NOT dropped here.
--   - `ClaimType` is used by `Inspection.claimType` (live, schema-declared).
--   - `ScopeCategory` and `ScopeUnit` are no longer referenced after this
--     migration but harmless if left. A future cleanup PR can drop unused
--     enums if desired. Out of scope for this PR.

ALTER TABLE "ScopeItem"
  DROP COLUMN IF EXISTS "code",
  DROP COLUMN IF EXISTS "scopeCategory",
  DROP COLUMN IF EXISTS "iicrcStandard",
  DROP COLUMN IF EXISTS "scopeUnit",
  DROP COLUMN IF EXISTS "auUnitPrice",
  DROP COLUMN IF EXISTS "acceptedByInsurer",
  DROP COLUMN IF EXISTS "acceptanceRate",
  DROP COLUMN IF EXISTS "claimType",
  DROP COLUMN IF EXISTS "lastPriceUpdate";

-- Drop the associated indexes (original phase1 created these — also no-op
-- on prod where they were never created)
DROP INDEX IF EXISTS "ScopeItem_claimType_idx";
DROP INDEX IF EXISTS "ScopeItem_scopeCategory_idx";
