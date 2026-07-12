-- RA-1807 drift repair — WS2 of the RA-1807 remediation spec (docs/specs/spm-remediation-2026-07-12.md).
--
-- Brings prod (Supabase udooysjajglluvuxkijp) back in line with prisma/schema.prisma
-- by dropping three stale UNIQUE indexes whose prior DROP silently no-op'd against
-- the :6543 pooler, and relaxing XeroAccountCodeMapping.category to nullable. The
-- schema ALREADY declares every one of these as the intended state, so no
-- schema.prisma edit accompanies this migration (AC-9): it only makes the DB match.
--
-- ── APPLY IS FOUNDER-GATED (Session B) ──────────────────────────────────────────
-- Preconditions (spec §17):
--   1. WS0 has set DIRECT_URL to the udooy :5432 DIRECT connection. If it is still
--      the :6543 pooler, these DROPs silently no-op too — the RA-1807 root cause.
--   2. Apply via the RA-1807 runbook Step 4, which supplies the single transaction
--      and ON_ERROR_STOP:
--        psql "$DIRECT_URL" --single-transaction -v ON_ERROR_STOP=1 \
--          -f prisma/migrations/20260712000000_ra_1807_drift_repair/migration.sql
--      then reconcile the ledger:
--        prisma migrate resolve --applied 20260712000000_ra_1807_drift_repair
--      (A normal `prisma migrate deploy` on a host with a correct :5432 DIRECT_URL
--      applies it identically — the statements are transactional, so prisma's own
--      per-migration transaction IS the single txn.)
--   3. Verify by LIVE READBACK (pg_indexes / information_schema.columns), never the
--      ledger (AC-11):  the 3 indexes are gone and category.is_nullable = 'YES'.
--
-- ── CARVE-OUT (AC-7) ────────────────────────────────────────────────────────────
-- The prod-only XeroAccountCodeMapping.userId column (NOT NULL, no default, absent
-- from the schema) is NOT dropped here. DROP-vs-adopt is a founder decision
-- (RA-6996); a Prisma `.create()` will keep raising the userId NOT NULL violation
-- until that separate gated decision lands. Only the category NOT NULL clears here.
--
-- ── DUPLICATE TRIPWIRE (AC-8) ───────────────────────────────────────────────────
-- A truly-enforcing UNIQUE cannot contain duplicates, so before each DROP we assert
-- there are none; a hit means the index was not enforcing and we MUST abort rather
-- than silently proceed. Each check is nested inside an index-existence guard so the
-- referenced columns are only planned when the index (hence the columns) exists —
-- keeping the migration a clean no-op on a schema-built branch (AC-10) where these
-- indexes, and the prod-only userId column, do not exist.

-- 1) Integration: drop the stale narrow (userId, provider) unique. The intended
--    unique is (userId, workspaceId, provider) — RA-1226 multi-workspace connect.
DO $$
BEGIN
  IF to_regclass('public."Integration_userId_provider_key"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM "Integration"
      GROUP BY "userId", "provider" HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'RA-1807 abort: duplicate (userId, provider) rows in Integration — the stale unique was not enforcing; investigate before dropping';
    END IF;
  END IF;
END $$;
DROP INDEX IF EXISTS "Integration_userId_provider_key";

-- 2) EnvironmentalData: drop the stale UNIQUE(inspectionId). The table is now a
--    time-series (multiple readings per inspection) — schema removed the @unique.
DO $$
BEGIN
  IF to_regclass('public."EnvironmentalData_inspectionId_key"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM "EnvironmentalData"
      GROUP BY "inspectionId" HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'RA-1807 abort: duplicate inspectionId rows in EnvironmentalData — unexpected under the stale unique; investigate before dropping';
    END IF;
  END IF;
END $$;
DROP INDEX IF EXISTS "EnvironmentalData_inspectionId_key";

-- 3) XeroAccountCodeMapping: drop the hidden (userId, category, damageType) unique
--    that exists in neither the schema nor RA-6996. (References the prod-only
--    userId column — only planned when the index exists, i.e. on prod, not branch.)
DO $$
BEGIN
  IF to_regclass('public."XeroAccountCodeMapping_userId_category_damageType_key"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM "XeroAccountCodeMapping"
      GROUP BY "userId", "category", "damageType" HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'RA-1807 abort: duplicate (userId, category, damageType) rows in XeroAccountCodeMapping — the stale unique was not enforcing; investigate before dropping';
    END IF;
  END IF;
END $$;
DROP INDEX IF EXISTS "XeroAccountCodeMapping_userId_category_damageType_key";

-- 4) XeroAccountCodeMapping.category → nullable (schema: `category String?`; null =
--    the default rule applied when no category-specific mapping exists). Idempotent:
--    a no-op where category is already nullable (e.g. a schema-built branch).
ALTER TABLE "XeroAccountCodeMapping" ALTER COLUMN "category" DROP NOT NULL;
