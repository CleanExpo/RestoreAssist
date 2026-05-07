-- RA-1229: ExternalJob.clientExternalId — webhook resolution hot path, no index
-- Guard: table may not exist on prod if RA-1807 schema drift not yet remediated.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ExternalJob') THEN
    CREATE INDEX IF NOT EXISTS "ExternalJob_integrationId_clientExternalId_idx"
      ON "ExternalJob"("integrationId", "clientExternalId");
  END IF;
END $$;

-- RA-1230: Integration.tenantId / realmId / companyId — webhook resolution scans
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Integration') THEN
    CREATE INDEX IF NOT EXISTS "Integration_tenantId_idx"  ON "Integration"("tenantId");
    CREATE INDEX IF NOT EXISTS "Integration_realmId_idx"   ON "Integration"("realmId");
    CREATE INDEX IF NOT EXISTS "Integration_companyId_idx" ON "Integration"("companyId");
  END IF;
END $$;

-- RA-1232: DrNrpgJobSync.claimNumber — claim lookup, un-indexed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'DrNrpgJobSync') THEN
    CREATE INDEX IF NOT EXISTS "DrNrpgJobSync_claimNumber_idx" ON "DrNrpgJobSync"("claimNumber");
  END IF;
END $$;

-- RA-1233: XeroAccountCodeMapping reverse lookup — accountCode → category
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'XeroAccountCodeMapping') THEN
    CREATE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_accountCode_idx"
      ON "XeroAccountCodeMapping"("integrationId", "accountCode");
  END IF;
END $$;

-- RA-1228: Invoice missing externalSyncRetryCount for dead-letter gate
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Invoice') THEN
    ALTER TABLE "Invoice"
      ADD COLUMN IF NOT EXISTS "externalSyncRetryCount" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
