-- RA-6954 — add the CLIENT_COMMS value to the AddonSku enum.
--
-- Restoration Pulse client-comms monetisation: a recurring $11/month add-on
-- whose active FeatureEntitlement unlocks client-facing Pulse email sends
-- (step transitions, drying-goal changes, the daily digest, the Code of
-- Practice update and the post-close review-ask). The enum is extended so a
-- FeatureEntitlement row can carry sku = 'CLIENT_COMMS'.
--
-- Additive + idempotent + deploy-safe:
--   * ADD VALUE only extends the enum; no existing value is renamed or removed.
--   * IF NOT EXISTS makes a replay a no-op (Postgres 12+).
--   * Ordered after 20260705000000_ra_6922_feature_entitlement, which creates
--     the AddonSku type, so the type always exists when this runs.

ALTER TYPE "AddonSku" ADD VALUE IF NOT EXISTS 'CLIENT_COMMS';
