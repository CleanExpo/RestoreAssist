-- Phase 1 RLS drift repair: XeroSyncStatus was added after RA-4970.
-- Server-side Prisma/service-role paths bypass RLS; browser anon access should default deny.
DO $$
BEGIN
  IF to_regclass('public."XeroSyncStatus"') IS NOT NULL THEN
    ALTER TABLE public."XeroSyncStatus" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
