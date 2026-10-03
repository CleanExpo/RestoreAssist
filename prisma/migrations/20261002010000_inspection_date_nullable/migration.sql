-- Intake drafts may be created before anyone has attended the property.
-- Preserve every existing date; only remove the synthetic default and NOT NULL.
ALTER TABLE "Inspection" ALTER COLUMN "inspectionDate" DROP DEFAULT;
ALTER TABLE "Inspection" ALTER COLUMN "inspectionDate" DROP NOT NULL;
