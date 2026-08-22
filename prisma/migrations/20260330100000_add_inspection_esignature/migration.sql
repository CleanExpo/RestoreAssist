-- RA-269: E-signature capture for inspection sign-off
-- Adds signature storage URL, timestamp, and technician name to Inspection

ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMPTZ;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "signedByName" TEXT;
