-- Drop existing User table and related constraints
DROP TABLE IF EXISTS "User" CASCADE;

-- Recreate User table with correct schema
CREATE TABLE "User" (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMP(3),
  name TEXT,
  image TEXT,
  password TEXT,
  role "Role" NOT NULL DEFAULT 'USER'::"Role",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Subscription fields
  "subscriptionStatus" "SubscriptionStatus" DEFAULT 'TRIAL'::"SubscriptionStatus",
  "subscriptionPlan" TEXT,
  "subscriptionId" TEXT UNIQUE,
  "stripeCustomerId" TEXT UNIQUE,
  "trialEndsAt" TIMESTAMP(3),
  "subscriptionEndsAt" TIMESTAMP(3),
  "creditsRemaining" INTEGER DEFAULT 3,
  "totalCreditsUsed" INTEGER DEFAULT 0,
  "lastBillingDate" TIMESTAMP(3),
  "nextBillingDate" TIMESTAMP(3),
  
  -- Add-on tracking
  "addonReports" INTEGER DEFAULT 0,
  "monthlyReportsUsed" INTEGER DEFAULT 0,
  "monthlyResetDate" TIMESTAMP(3),
  "signupBonusApplied" BOOLEAN DEFAULT false,
  
  -- Premium Features
  "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false,
  
  -- Business Information
  "businessName" TEXT,
  "businessAddress" TEXT,
  "businessLogo" TEXT,
  "businessABN" TEXT,
  "businessPhone" TEXT,
  "businessEmail" TEXT,
  
  -- Interview System
  "interviewTier" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD'::"SubscriptionTierLevel",
  "preferredQuestionStyle" TEXT,
  "autoAcceptSuggestionsAboveConfidence" DOUBLE PRECISION,
  "subscriptionTierId" TEXT
);

-- Create indexes for performance
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_subscriptionId_idx" ON "User"("subscriptionId");
CREATE INDEX "User_stripeCustomerId_idx" ON "User"("stripeCustomerId");
CREATE INDEX "User_hasPremiumInspectionReports_idx" ON "User"("hasPremiumInspectionReports");
