-- RA-1226: Widen Integration unique from (userId, provider) to (userId, workspaceId, provider)
-- Allows a user to connect the same provider (e.g. Xero) to multiple workspaces.
-- Guard: table may not exist on prod due to RA-1807 schema drift.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Integration') THEN
    -- Drop old unique constraint
    ALTER TABLE "Integration"
      DROP CONSTRAINT IF EXISTS "Integration_userId_provider_key";
    -- Add new composite unique (workspaceId nullable — NULL values don't collide)
    CREATE UNIQUE INDEX IF NOT EXISTS "Integration_userId_workspaceId_provider_key"
      ON "Integration"("userId", "workspaceId", "provider");
  END IF;
END $$;

-- RA-1225: Add @@unique([userId, name]) to CostLibrary to prevent duplicate names per user.
-- Includes a dedupe pass: keep the most recently updated row when duplicates exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'CostLibrary') THEN
    -- Dedupe: for each (userId, name) pair, delete all but the most recent row
    DELETE FROM "CostLibrary"
    WHERE id NOT IN (
      SELECT DISTINCT ON ("userId", "name") id
      FROM "CostLibrary"
      ORDER BY "userId", "name", "updatedAt" DESC
    );
    -- Now add the unique constraint safely
    CREATE UNIQUE INDEX IF NOT EXISTS "CostLibrary_userId_name_key"
      ON "CostLibrary"("userId", "name");
  END IF;
END $$;
