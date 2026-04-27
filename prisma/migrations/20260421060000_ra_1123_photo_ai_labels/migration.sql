-- RA-1123: Claude Vision AI-label fields on InspectionPhoto.
-- All nullable — existing rows unaffected; labelledBy default "HUMAN_TECH"
-- already preserved for pre-AI photos.
ALTER TABLE "InspectionPhoto" ADD COLUMN "aiLabels"     JSONB;
ALTER TABLE "InspectionPhoto" ADD COLUMN "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "InspectionPhoto" ADD COLUMN "aiModel"      TEXT;
ALTER TABLE "InspectionPhoto" ADD COLUMN "aiRunAt"      TIMESTAMP(3);
