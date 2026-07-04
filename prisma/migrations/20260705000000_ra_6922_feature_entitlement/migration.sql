-- RA-6922 (P1) — FeatureEntitlement: per-workspace BYOK monetisation add-on gate.
--
-- byok-monetisation-spec §6 (P1 entitlement layer). Records which of the five
-- $11/month add-on SKUs a workspace has active, plus a nullable Stripe
-- subscription-item / price linkage to be wired later.
--
-- Additive + idempotent + deploy-safe:
--   * A NEW empty table — its unique index cannot fail on existing data.
--   * The enum, table, indexes and FK are all created IF NOT EXISTS.
--   * No existing table or column is altered; no destructive DROP.
--   * The guard (lib/entitlements/requireAddon) is not yet wired into any
--     surface, so this changes no runtime behaviour for existing workspaces.

-- CreateEnum: AddonSku (guarded — CREATE TYPE has no IF NOT EXISTS in Postgres).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AddonSku') THEN
    CREATE TYPE "AddonSku" AS ENUM ('VOICE', 'TECHNICIAN_SEATS', 'BOOKKEEPING', 'SERVICE_CRM', 'PAYMENTS');
  END IF;
END
$$;

-- CreateTable: FeatureEntitlement
CREATE TABLE IF NOT EXISTS "FeatureEntitlement" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sku" "AddonSku" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureEntitlement_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureEntitlement_workspaceId_sku_key" ON "FeatureEntitlement"("workspaceId", "sku");
CREATE INDEX IF NOT EXISTS "FeatureEntitlement_workspaceId_idx" ON "FeatureEntitlement"("workspaceId");
CREATE INDEX IF NOT EXISTS "FeatureEntitlement_sku_idx" ON "FeatureEntitlement"("sku");
CREATE INDEX IF NOT EXISTS "FeatureEntitlement_active_idx" ON "FeatureEntitlement"("active");

-- ForeignKey (guarded — ADD CONSTRAINT has no IF NOT EXISTS in Postgres).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FeatureEntitlement_workspaceId_fkey'
  ) THEN
    ALTER TABLE "FeatureEntitlement"
      ADD CONSTRAINT "FeatureEntitlement_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
