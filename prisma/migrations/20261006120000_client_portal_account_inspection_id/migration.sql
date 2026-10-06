-- WP-02: bind a client portal link to the job it was sent for.
-- Additive and nullable: existing links keep their current behaviour.
ALTER TABLE "ClientPortalAccount" ADD COLUMN "inspectionId" TEXT;
CREATE INDEX "ClientPortalAccount_inspectionId_idx" ON "ClientPortalAccount"("inspectionId");
