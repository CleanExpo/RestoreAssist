-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM ('INTAKE', 'STABILISATION_ACTIVE', 'WHS_HOLD', 'STABILISATION_COMPLETE', 'SCOPE_DRAFT', 'SCOPE_APPROVED', 'DRYING_ACTIVE', 'VARIATION_REVIEW', 'DRYING_CERTIFIED', 'CLOSEOUT', 'INVOICE_ISSUED', 'INVOICE_PAID', 'DISPUTED', 'CLOSED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "ClaimProgress" (
    "id" TEXT NOT NULL,
    "state" "ClaimState" NOT NULL DEFAULT 'INTAKE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "reportId" TEXT,
    "inspectionId" TEXT,
    "carrierVariationThresholdPercent" INTEGER,
    "managerReviewFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressTransition" (
    "id" TEXT NOT NULL,
    "claimProgressId" TEXT NOT NULL,
    "fromState" "ClaimState" NOT NULL,
    "toState" "ClaimState" NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "supersedesId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressAttestation" (
    "id" TEXT NOT NULL,
    "claimProgressId" TEXT NOT NULL,
    "transitionId" TEXT,
    "attestorUserId" TEXT NOT NULL,
    "attestorRole" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "bodyJson" TEXT NOT NULL,
    "signatureSha256" TEXT NOT NULL,
    "manifestJson" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimProgress_reportId_key" ON "ClaimProgress"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimProgress_inspectionId_key" ON "ClaimProgress"("inspectionId");

-- CreateIndex
CREATE INDEX "ClaimProgress_state_idx" ON "ClaimProgress"("state");

-- CreateIndex
CREATE INDEX "ClaimProgress_managerReviewFlag_idx" ON "ClaimProgress"("managerReviewFlag");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTransition_idempotencyKey_key" ON "ProgressTransition"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTransition_supersedesId_key" ON "ProgressTransition"("supersedesId");

-- CreateIndex
CREATE INDEX "ProgressTransition_claimProgressId_createdAt_idx" ON "ProgressTransition"("claimProgressId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressTransition_toState_idx" ON "ProgressTransition"("toState");

-- CreateIndex
CREATE INDEX "ProgressTransition_actorUserId_createdAt_idx" ON "ProgressTransition"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressAttestation_supersedesId_key" ON "ProgressAttestation"("supersedesId");

-- CreateIndex
CREATE INDEX "ProgressAttestation_claimProgressId_evidenceKey_idx" ON "ProgressAttestation"("claimProgressId", "evidenceKey");

-- CreateIndex
CREATE INDEX "ProgressAttestation_attestorUserId_createdAt_idx" ON "ProgressAttestation"("attestorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressAttestation_transitionId_idx" ON "ProgressAttestation"("transitionId");

-- CreateIndex
CREATE INDEX "ProgressAttestation_withdrawnAt_idx" ON "ProgressAttestation"("withdrawnAt");

-- AddForeignKey
ALTER TABLE "ClaimProgress" ADD CONSTRAINT "ClaimProgress_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimProgress" ADD CONSTRAINT "ClaimProgress_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressTransition" ADD CONSTRAINT "ProgressTransition_claimProgressId_fkey" FOREIGN KEY ("claimProgressId") REFERENCES "ClaimProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressTransition" ADD CONSTRAINT "ProgressTransition_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ProgressTransition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_claimProgressId_fkey" FOREIGN KEY ("claimProgressId") REFERENCES "ClaimProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "ProgressTransition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ProgressAttestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

