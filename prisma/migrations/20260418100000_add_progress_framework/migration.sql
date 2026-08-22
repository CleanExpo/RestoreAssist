-- RA-1381 (Board M-5): Progress Framework
-- Additive migration. No existing tables altered.
-- Adds: ClaimState enum, ClaimProgress, ProgressTransition, ProgressAttestation.

-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM (
  'INTAKE',
  'STABILISATION_ACTIVE',
  'WHS_HOLD',
  'STABILISATION_COMPLETE',
  'SCOPE_DRAFT',
  'SCOPE_APPROVED',
  'DRYING_ACTIVE',
  'VARIATION_REVIEW',
  'DRYING_CERTIFIED',
  'CLOSEOUT',
  'INVOICE_ISSUED',
  'INVOICE_PAID',
  'DISPUTED',
  'CLOSED',
  'WITHDRAWN'
);

-- CreateTable
CREATE TABLE "ClaimProgress" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "inspectionId" TEXT,
  "currentState" "ClaimState" NOT NULL DEFAULT 'INTAKE',
  "previousState" "ClaimState",
  "version" INTEGER NOT NULL DEFAULT 0,
  "primaryTechnicianId" TEXT,
  "primaryManagerId" TEXT,
  "accountingUserId" TEXT,
  "carrierContactEmail" TEXT,
  "legalUserId" TEXT,
  "carrierVariationThresholdPercent" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "ClaimProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressTransition" (
  "id" TEXT NOT NULL,
  "claimProgressId" TEXT NOT NULL,
  "transitionKey" TEXT NOT NULL,
  "fromState" "ClaimState" NOT NULL,
  "toState" "ClaimState" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorIp" TEXT,
  "guardSnapshot" JSONB NOT NULL,
  "integrationReceipts" JSONB,
  "integrityHash" TEXT NOT NULL,
  "transitionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProgressTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressAttestation" (
  "id" TEXT NOT NULL,
  "claimProgressId" TEXT NOT NULL,
  "transitionId" TEXT,
  "attestorUserId" TEXT NOT NULL,
  "attestorRole" TEXT NOT NULL,
  "attestorName" TEXT NOT NULL,
  "attestorEmail" TEXT NOT NULL,
  "attestationType" TEXT NOT NULL,
  "attestationNote" TEXT,
  "docusignEnvelopeId" TEXT,
  "docusignStatus" TEXT,
  "signatureDataUrl" TEXT,
  "integrityHash" TEXT NOT NULL,
  "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProgressAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (ClaimProgress)
CREATE UNIQUE INDEX "ClaimProgress_reportId_key" ON "ClaimProgress"("reportId");
CREATE UNIQUE INDEX "ClaimProgress_inspectionId_key" ON "ClaimProgress"("inspectionId");
CREATE INDEX "ClaimProgress_currentState_idx" ON "ClaimProgress"("currentState");
CREATE INDEX "ClaimProgress_primaryManagerId_idx" ON "ClaimProgress"("primaryManagerId");
CREATE INDEX "ClaimProgress_primaryTechnicianId_idx" ON "ClaimProgress"("primaryTechnicianId");
CREATE INDEX "ClaimProgress_createdAt_idx" ON "ClaimProgress"("createdAt");

-- CreateIndex (ProgressTransition)
CREATE INDEX "ProgressTransition_claimProgressId_transitionedAt_idx" ON "ProgressTransition"("claimProgressId", "transitionedAt");
CREATE INDEX "ProgressTransition_actorUserId_idx" ON "ProgressTransition"("actorUserId");
CREATE INDEX "ProgressTransition_transitionKey_idx" ON "ProgressTransition"("transitionKey");
CREATE INDEX "ProgressTransition_transitionedAt_idx" ON "ProgressTransition"("transitionedAt");

-- CreateIndex (ProgressAttestation)
CREATE INDEX "ProgressAttestation_claimProgressId_idx" ON "ProgressAttestation"("claimProgressId");
CREATE INDEX "ProgressAttestation_transitionId_idx" ON "ProgressAttestation"("transitionId");
CREATE INDEX "ProgressAttestation_attestorUserId_idx" ON "ProgressAttestation"("attestorUserId");
CREATE INDEX "ProgressAttestation_attestationType_idx" ON "ProgressAttestation"("attestationType");

-- AddForeignKey
ALTER TABLE "ClaimProgress" ADD CONSTRAINT "ClaimProgress_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimProgress" ADD CONSTRAINT "ClaimProgress_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressTransition" ADD CONSTRAINT "ProgressTransition_claimProgressId_fkey" FOREIGN KEY ("claimProgressId") REFERENCES "ClaimProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_claimProgressId_fkey" FOREIGN KEY ("claimProgressId") REFERENCES "ClaimProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "ProgressTransition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
