-- RA-6920 B6 — quantity plumbing for the per-seat TECHNICIAN_SEATS add-on.
--
-- Adds a nullable `seats` column to FeatureEntitlement so the webhook can
-- persist the purchased seat count (the Stripe subscription-item `quantity`)
-- for the quantity-based TECHNICIAN_SEATS add-on. Null for every flat add-on
-- (FLOORPLAN_UNDERLAY / SERVICE_CRM / BOOKKEEPING / PAYMENTS / CLIENT_COMMS),
-- which are billed at quantity 1 and never read this column.
--
-- Additive + deploy-safe:
--   * ADD COLUMN of a nullable Int with no default touches no existing row.
--   * No enum change, no drop, no rename, no backfill.
--   * Ordered after 20260705000000_ra_6922_feature_entitlement, which creates
--     the FeatureEntitlement table.

ALTER TABLE "FeatureEntitlement" ADD COLUMN "seats" INTEGER;
