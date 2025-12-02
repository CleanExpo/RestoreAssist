-- Migration to add subscription fields to User table

-- Create SubscriptionStatus enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add subscription fields to User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT,
ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "creditsRemaining" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS "totalCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastBillingDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "nextBillingDate" TIMESTAMP(3);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "User_subscriptionStatus_idx" ON "User"("subscriptionStatus");
CREATE INDEX IF NOT EXISTS "User_stripeCustomerId_idx" ON "User"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "User_subscriptionId_idx" ON "User"("subscriptionId");
