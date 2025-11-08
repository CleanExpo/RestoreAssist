-- Add multi-LLM provider support fields to User table
-- Run this SQL in Supabase SQL Editor

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "openaiApiKey" TEXT,
ADD COLUMN IF NOT EXISTS "googleApiKey" TEXT,
ADD COLUMN IF NOT EXISTS "preferredLLMProvider" TEXT DEFAULT 'anthropic',
ADD COLUMN IF NOT EXISTS "preferredLLMModel" TEXT;

-- Update existing users to have anthropic as default provider
UPDATE "User"
SET "preferredLLMProvider" = 'anthropic'
WHERE "preferredLLMProvider" IS NULL;

-- Create index for faster provider lookups
CREATE INDEX IF NOT EXISTS "User_preferredLLMProvider_idx" ON "User"("preferredLLMProvider");
