-- CreateTable: ScopeVariation (RA-1136b compliance gate)
CREATE TABLE IF NOT EXISTS "ScopeVariation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorisationSource" TEXT NOT NULL,
    "authorisationRef" TEXT,
    "costDeltaCents" INTEGER NOT NULL,
    "costDeltaPercent" DOUBLE PRECISION,
    "approvedByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "autoApprovalRule" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeVariation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScopeVariation_inspectionId_createdAt_idx" ON "ScopeVariation"("inspectionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScopeVariation_status_idx" ON "ScopeVariation"("status");

-- AddForeignKey
ALTER TABLE "ScopeVariation" ADD CONSTRAINT "ScopeVariation_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
