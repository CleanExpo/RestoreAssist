-- CreateTable
CREATE TABLE "BrandAmbassadorPost" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draft" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAmbassadorPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSyncJob" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandAmbassadorPost_projectKey_idx" ON "BrandAmbassadorPost"("projectKey");

-- CreateIndex
CREATE INDEX "BrandAmbassadorPost_year_isoWeek_idx" ON "BrandAmbassadorPost"("year", "isoWeek");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAmbassadorPost_projectKey_isoWeek_year_key" ON "BrandAmbassadorPost"("projectKey", "isoWeek", "year");

-- CreateIndex
CREATE INDEX "InvoiceSyncJob_status_priority_createdAt_idx" ON "InvoiceSyncJob"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceSyncJob_invoiceId_idx" ON "InvoiceSyncJob"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSyncJob_invoiceId_provider_key" ON "InvoiceSyncJob"("invoiceId", "provider");
