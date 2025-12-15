/*
  Warnings:

  - You are about to drop the column `biologicalMouldVisibleGrowth` on the `Report` table. All the data in the column will be lost.
  - Made the column `biologicalMouldDetected` on table `Report` required. This step will fail if there are existing NULL values in that column.

*/
-- Idempotent migration that handles partial failures and can be safely re-run

-- Step 1: Add biologicalMouldDetected if it doesn't exist
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

-- Step 2: Migrate data from biologicalMouldVisibleGrowth if it exists
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
        WHERE "biologicalMouldVisibleGrowth" IS NOT NULL 
        AND ("biologicalMouldDetected" IS NULL OR "biologicalMouldDetected" = false);
        
        ALTER TABLE "Report" DROP COLUMN IF EXISTS "biologicalMouldVisibleGrowth";
    END IF;
END $$;

-- Step 3: Ensure all NULL values are set to false before making NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'biologicalMouldDetected'
    ) THEN
        UPDATE "Report" SET "biologicalMouldDetected" = false WHERE "biologicalMouldDetected" IS NULL;
    END IF;
END $$;

-- Step 4: Change methamphetamineScreen to TEXT if it exists and is not already TEXT
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'methamphetamineScreen'
    ) THEN
        -- Check current data type
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
    END IF;
END $$;

-- Step 5: Set biologicalMouldDetected to NOT NULL if it's not already
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Report' 
        AND column_name = 'biologicalMouldDetected'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "Report" ALTER COLUMN "biologicalMouldDetected" SET DEFAULT false;
        ALTER TABLE "Report" ALTER COLUMN "biologicalMouldDetected" SET NOT NULL;
    END IF;
END $$;
