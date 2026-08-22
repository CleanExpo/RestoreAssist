-- RA-1274: dedupe GitHub webhook redeliveries on x-github-delivery header.
-- Nullable so legacy AppRelease rows stay valid; unique so future
-- redeliveries fail fast at insert time (P2002 → skip).

ALTER TABLE "AppRelease" ADD COLUMN "githubDeliveryId" TEXT;

CREATE UNIQUE INDEX "AppRelease_githubDeliveryId_key" ON "AppRelease"("githubDeliveryId");
