-- SP-E: Storage BYOK mirror queue.
-- Purely additive: no existing rows altered, no destructive drops.

-- CreateEnum
CREATE TYPE "MirrorJobKind" AS ENUM ('PHOTO', 'REPORT', 'INVOICE', 'JOB_PACKAGE', 'AUDIT_LOG');

-- CreateEnum
CREATE TYPE "MirrorJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "StorageMirrorJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "MirrorJobKind" NOT NULL,
    "status" "MirrorJobStatus" NOT NULL DEFAULT 'PENDING',
    "photoId" TEXT,
    "reportId" TEXT,
    "invoiceId" TEXT,
    "inspectionId" TEXT,
    "sourceStoragePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveViewUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StorageMirrorJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotency — composite unique with nullable cols)
CREATE UNIQUE INDEX "StorageMirrorJob_orgId_kind_photoId_reportId_invoiceId_inspectionId_key"
    ON "StorageMirrorJob"("orgId", "kind", "photoId", "reportId", "invoiceId", "inspectionId");

-- CreateIndex (queue scan: status + nextAttemptAt)
CREATE INDEX "StorageMirrorJob_status_nextAttemptAt_idx" ON "StorageMirrorJob"("status", "nextAttemptAt");

-- CreateIndex (per-org stats)
CREATE INDEX "StorageMirrorJob_orgId_status_idx" ON "StorageMirrorJob"("orgId", "status");

-- CreateIndex (sort by recency)
CREATE INDEX "StorageMirrorJob_createdAt_idx" ON "StorageMirrorJob"("createdAt");

-- AddForeignKey
ALTER TABLE "StorageMirrorJob"
    ADD CONSTRAINT "StorageMirrorJob_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
