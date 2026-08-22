-- AddColumn: Inspection.contentsManifestDraft
-- RA-405: Contents manifest AI draft — store generated manifest JSON on the inspection
ALTER TABLE "Inspection" ADD COLUMN "contentsManifestDraft" JSONB;
