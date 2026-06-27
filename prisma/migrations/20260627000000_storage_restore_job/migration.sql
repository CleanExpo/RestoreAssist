-- SP-E: Restore-from-Google-Drive durable queue.
--
-- Mirrors the StorageMirrorJob design but runs in reverse: each row
-- represents a single file being rehydrated back into Supabase primary
-- storage from the org's Google Drive copy. Source is always a COMPLETED
-- StorageMirrorJob; key fields are denormalised onto this row so a restore
-- is self-contained even after mirror rows are cleaned up.
--
-- Additive only — no existing tables altered, no data migrated. Safe to
-- apply via the normal migrate-deploy path.

-- CreateEnum
CREATE TYPE "RestoreJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'SKIPPED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "RestoreMode" AS ENUM ('MISSING', 'FORCE');

-- CreateTable
CREATE TABLE "StorageRestoreJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sourceMirrorJobId" TEXT NOT NULL,
    "kind" "MirrorJobKind" NOT NULL,
    "mode" "RestoreMode" NOT NULL DEFAULT 'MISSING',
    "status" "RestoreJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceStoragePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "initiatedByUserId" TEXT,
    "expectedSha256" TEXT,
    "restoredSha256" TEXT,
    "restoredBytes" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StorageRestoreJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageRestoreJob_orgId_sourceMirrorJobId_key" ON "StorageRestoreJob"("orgId", "sourceMirrorJobId");

-- CreateIndex
CREATE INDEX "StorageRestoreJob_orgId_status_idx" ON "StorageRestoreJob"("orgId", "status");

-- CreateIndex
CREATE INDEX "StorageRestoreJob_status_nextAttemptAt_idx" ON "StorageRestoreJob"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "StorageRestoreJob" ADD CONSTRAINT "StorageRestoreJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
