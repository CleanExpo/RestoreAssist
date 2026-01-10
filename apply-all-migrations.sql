-- This file combines all Prisma migrations in order to update the Supabase schema

-- ==================== 20251222035635_add_addon_tracking ====================
ALTER TABLE "User" ADD COLUMN     "addonReports" INTEGER DEFAULT 0;
ALTER TABLE "User" ADD COLUMN     "monthlyReportsUsed" INTEGER DEFAULT 0;
ALTER TABLE "User" ADD COLUMN     "monthlyResetDate" TIMESTAMP(3);

-- ==================== 20251222105604_add_signup_bonus_tracking ====================
ALTER TABLE "User" ADD COLUMN "signupBonusApplied" BOOLEAN DEFAULT false;

-- ==================== 20260109_add_premium_inspection_reports ====================
-- Add premium inspection reports feature flag to User model
ALTER TABLE "User" ADD COLUMN "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false;
-- Create index for efficient feature gate checks
CREATE INDEX "User_hasPremiumInspectionReports_idx" ON "User"("hasPremiumInspectionReports");
