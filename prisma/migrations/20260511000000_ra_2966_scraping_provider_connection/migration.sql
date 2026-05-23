-- RA-2966: ScrapingProviderConnection — per-workspace BYOK for property-data scraping
-- Parallel to ProviderConnection (RA-414). Same encryption + status + audit pattern;
-- separate model so the schema reads honestly — scraping providers are not AI providers.

-- CreateEnum: ScrapingProvider
CREATE TYPE "ScrapingProvider" AS ENUM ('APIFY', 'BRIGHTDATA', 'ZYTE', 'FIRECRAWL', 'SHARED');

-- CreateTable: ScrapingProviderConnection
CREATE TABLE "ScrapingProviderConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "ScrapingProvider" NOT NULL,
  "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "encryptedCredentials" TEXT NOT NULL,
  "encryptedConfig" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdByMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrapingProviderConnection_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ScrapingProviderConnection_workspaceId_provider_key" ON "ScrapingProviderConnection"("workspaceId", "provider");
CREATE INDEX "ScrapingProviderConnection_workspaceId_idx" ON "ScrapingProviderConnection"("workspaceId");
CREATE INDEX "ScrapingProviderConnection_provider_idx" ON "ScrapingProviderConnection"("provider");
CREATE INDEX "ScrapingProviderConnection_status_idx" ON "ScrapingProviderConnection"("status");

-- ForeignKey
ALTER TABLE "ScrapingProviderConnection"
  ADD CONSTRAINT "ScrapingProviderConnection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
