-- Add premium inspection reports feature flag to User model
ALTER TABLE "User" ADD COLUMN "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN "User"."hasPremiumInspectionReports" IS 'Feature flag for access to 3-stakeholder PDF generator ($49/month premium add-on)';

-- Create index for efficient feature gate checks
CREATE INDEX "User_hasPremiumInspectionReports_idx" ON "User"("hasPremiumInspectionReports");
