-- RA-1229: ExternalJob.clientExternalId — webhook resolution hot path, no index
CREATE INDEX IF NOT EXISTS "ExternalJob_integrationId_clientExternalId_idx"
  ON "ExternalJob"("integrationId", "clientExternalId");

-- RA-1230: Integration.tenantId / realmId / companyId — webhook resolution scans
CREATE INDEX IF NOT EXISTS "Integration_tenantId_idx"   ON "Integration"("tenantId");
CREATE INDEX IF NOT EXISTS "Integration_realmId_idx"    ON "Integration"("realmId");
CREATE INDEX IF NOT EXISTS "Integration_companyId_idx"  ON "Integration"("companyId");

-- RA-1232: DrNrpgJobSync.claimNumber — claim lookup, un-indexed
CREATE INDEX IF NOT EXISTS "DrNrpgJobSync_claimNumber_idx" ON "DrNrpgJobSync"("claimNumber");

-- RA-1233: XeroAccountCodeMapping reverse lookup — accountCode → category
CREATE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_accountCode_idx"
  ON "XeroAccountCodeMapping"("integrationId", "accountCode");

-- RA-1228: Invoice missing externalSyncRetryCount for dead-letter gate
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "externalSyncRetryCount" INTEGER NOT NULL DEFAULT 0;
