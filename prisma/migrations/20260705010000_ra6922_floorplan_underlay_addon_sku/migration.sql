-- RA-6922 — add the FLOORPLAN_UNDERLAY value to the AddonSku enum.
--
-- Layer 2 of the internet-floorplan-overlay gate: a recurring $11/month add-on
-- whose active FeatureEntitlement unlocks the floor-plan underlay scrape. The
-- enum is extended so a FeatureEntitlement row can carry sku = 'FLOORPLAN_UNDERLAY'.
--
-- Additive + idempotent + deploy-safe:
--   * ADD VALUE only extends the enum; no existing value is renamed or removed.
--   * IF NOT EXISTS makes a replay a no-op (Postgres 12+).
--   * Ordered after 20260705000000_ra_6922_feature_entitlement, which creates
--     the AddonSku type, so the type always exists when this runs.

ALTER TYPE "AddonSku" ADD VALUE IF NOT EXISTS 'FLOORPLAN_UNDERLAY';
