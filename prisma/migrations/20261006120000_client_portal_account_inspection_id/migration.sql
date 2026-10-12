-- WP-02: bind a client portal link to the job it was sent for.
-- Additive and nullable: existing links keep their current behaviour.
-- Idempotent on purpose: safe to run by hand first and again via migrate deploy.
ALTER TABLE "ClientPortalAccount" ADD COLUMN IF NOT EXISTS "inspectionId" TEXT;
CREATE INDEX IF NOT EXISTS "ClientPortalAccount_inspectionId_idx" ON "ClientPortalAccount"("inspectionId");
