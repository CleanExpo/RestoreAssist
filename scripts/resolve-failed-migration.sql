-- Script to resolve failed migration on Digital Ocean
-- This can be run directly on the database if needed

-- First, check if the migration is marked as failed
-- If biologicalMouldDetected doesn't exist, create it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'biologicalMouldDetected'
    ) THEN
        ALTER TABLE "Report" ADD COLUMN "biologicalMouldDetected" BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Migrate data from old column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'biologicalMouldVisibleGrowth'
    ) THEN
        UPDATE "Report" 
        SET "biologicalMouldDetected" = COALESCE("biologicalMouldVisibleGrowth", false)
        WHERE "biologicalMouldVisibleGrowth" IS NOT NULL;
        
        ALTER TABLE "Report" DROP COLUMN "biologicalMouldVisibleGrowth";
    END IF;
END $$;

-- Ensure no NULL values
UPDATE "Report" SET "biologicalMouldDetected" = false WHERE "biologicalMouldDetected" IS NULL;

-- Set default and NOT NULL
ALTER TABLE "Report" ALTER COLUMN "biologicalMouldDetected" SET DEFAULT false;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'biologicalMouldDetected'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "Report" ALTER COLUMN "biologicalMouldDetected" SET NOT NULL;
    END IF;
END $$;

-- Convert methamphetamineScreen to TEXT if needed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'methamphetamineScreen'
        AND data_type != 'text'
    ) THEN
        ALTER TABLE "Report" ALTER COLUMN "methamphetamineScreen" SET DATA TYPE TEXT USING 
            CASE 
                WHEN "methamphetamineScreen"::text IS NULL THEN NULL
                WHEN "methamphetamineScreen"::boolean = true THEN 'POSITIVE'
                WHEN "methamphetamineScreen"::boolean = false THEN 'NEGATIVE'
                ELSE "methamphetamineScreen"::text
            END;
    END IF;
END $$;

