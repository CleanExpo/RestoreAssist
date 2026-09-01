-- Add the CLIENT_EDUCATION value to the AddonSku enum.
--
-- Layer 2 of the client education library: a recurring $11/month add-on whose
-- active FeatureEntitlement unlocks the explainer library and the /learn kiosk
-- view on the client portal. The enum is extended so a FeatureEntitlement row
-- can carry sku = 'CLIENT_EDUCATION'.
--
-- Separate from CLIENT_COMMS on purpose. That SKU is scoped narrowly to
-- "Send clients automated Restoration Pulse status emails"; a firm may want the
-- education library without Pulse emails, or the reverse.
--
-- Additive + idempotent + deploy-safe:
--   * ADD VALUE only extends the enum; no existing value is renamed or removed.
--   * IF NOT EXISTS makes a replay a no-op (Postgres 12+).
--   * Ordered after 20260705000000_ra_6922_feature_entitlement, which creates
--     the AddonSku type, so the type always exists when this runs.

ALTER TYPE "AddonSku" ADD VALUE IF NOT EXISTS 'CLIENT_EDUCATION';
