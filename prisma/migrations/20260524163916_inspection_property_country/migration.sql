-- RA-1120: Add propertyCountry to Inspection model.
--
-- Drives jurisdiction-specific compliance gates:
--   - lib/compliance/nzbs-compliance-gate.ts (NZBS clause coverage)
--   - lib/compliance/safework-notification-gate.ts (jurisdiction lookup)
--
-- The 4 TODO_RA-1120 markers in those files defaulted to "AU" — this
-- migration matches that default so existing inspection rows are
-- unchanged at the application layer.
--
-- AU/NZ market only (per feedback_au_nz_market_only memory).
--
-- Data impact: every existing row receives `propertyCountry = 'AU'`
-- via DEFAULT. Zero rows fail; no backfill SQL needed.

ALTER TABLE "Inspection"
  ADD COLUMN "propertyCountry" TEXT NOT NULL DEFAULT 'AU';
