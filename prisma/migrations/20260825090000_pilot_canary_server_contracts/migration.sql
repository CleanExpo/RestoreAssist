-- Canary server contracts are deliberately opt-in and additive. No existing
-- workspace is marked as a sandbox by this migration.
ALTER TABLE "Workspace"
  ADD COLUMN "pilotSandboxEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PilotBudgetReservation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "companyKey" TEXT NOT NULL,
  "jobKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "ceilingUsd" DOUBLE PRECISION NOT NULL,
  "spentAtReservationUsd" DOUBLE PRECISION NOT NULL,
  "reservedUsd" DOUBLE PRECISION NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reconciledAt" TIMESTAMP(3),
  "generationCostUsd" DOUBLE PRECISION,
  "judgeCostUsd" DOUBLE PRECISION,
  "adjusterCostUsd" DOUBLE PRECISION,
  "failedAttemptCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalActualCostUsd" DOUBLE PRECISION,
  "reconciledSpentUsd" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotBudgetReservation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AssessmentGeneration"
  ADD COLUMN "pilotArtefactPayload" JSONB,
  ADD COLUMN "pilotBudgetReservationId" TEXT;

CREATE TABLE "PilotJudgeReceipt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "assessmentGenerationId" TEXT NOT NULL,
  "assessmentSha256" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "leaseExpiresAt" TIMESTAMP(3),
  "recoveryRequiredAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "receipt" JSONB,
  "authorisedMaxCostUsd" DOUBLE PRECISION NOT NULL,
  "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "errorStatus" INTEGER,
  "errorMessage" TEXT,
  "resolutionOutcome" TEXT,
  "resolutionEvidence" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotJudgeReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotBudgetReservation_workspaceId_idempotencyKey_key"
  ON "PilotBudgetReservation"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "PilotBudgetReservation_workspaceId_runId_companyKey_jobKey_key"
  ON "PilotBudgetReservation"("workspaceId", "runId", "companyKey", "jobKey");
CREATE INDEX "PilotBudgetReservation_workspaceId_createdAt_idx"
  ON "PilotBudgetReservation"("workspaceId", "createdAt");
CREATE INDEX "PilotBudgetReservation_workspaceId_reconciledAt_idx"
  ON "PilotBudgetReservation"("workspaceId", "reconciledAt");
CREATE INDEX "AssessmentGeneration_pilotBudgetReservationId_idx"
  ON "AssessmentGeneration"("pilotBudgetReservationId");
CREATE UNIQUE INDEX "PilotJudgeReceipt_workspaceId_idempotencyKey_key"
  ON "PilotJudgeReceipt"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "PilotJudgeReceipt_assessmentGenerationId_key"
  ON "PilotJudgeReceipt"("assessmentGenerationId");
CREATE INDEX "PilotJudgeReceipt_reservationId_status_idx"
  ON "PilotJudgeReceipt"("reservationId", "status");
CREATE INDEX "PilotJudgeReceipt_workspaceId_createdAt_idx"
  ON "PilotJudgeReceipt"("workspaceId", "createdAt");

ALTER TABLE "PilotBudgetReservation"
  ADD CONSTRAINT "PilotBudgetReservation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentGeneration"
  ADD CONSTRAINT "AssessmentGeneration_pilotBudgetReservationId_fkey"
  FOREIGN KEY ("pilotBudgetReservationId") REFERENCES "PilotBudgetReservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotJudgeReceipt"
  ADD CONSTRAINT "PilotJudgeReceipt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotJudgeReceipt"
  ADD CONSTRAINT "PilotJudgeReceipt_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "PilotBudgetReservation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotJudgeReceipt"
  ADD CONSTRAINT "PilotJudgeReceipt_assessmentGenerationId_fkey"
  FOREIGN KEY ("assessmentGenerationId") REFERENCES "AssessmentGeneration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only accounting ledger. Enable RLS with no client policy: all
-- mutations go through authenticated Next.js routes using the Prisma service
-- connection, while anon/authenticated PostgREST callers remain default-deny.
ALTER TABLE "PilotBudgetReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotJudgeReceipt" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "PilotAdjusterReceipt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "assessmentGenerationId" TEXT NOT NULL,
  "assessmentSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "leaseExpiresAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "result" JSONB,
  "authorisedMaxCostUsd" DOUBLE PRECISION NOT NULL,
  "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "resolutionOutcome" TEXT,
  "resolutionEvidence" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotAdjusterReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PilotAdjusterReceipt_assessmentGenerationId_key"
  ON "PilotAdjusterReceipt"("assessmentGenerationId");
CREATE INDEX "PilotAdjusterReceipt_reservationId_status_idx"
  ON "PilotAdjusterReceipt"("reservationId", "status");
CREATE INDEX "PilotAdjusterReceipt_workspaceId_createdAt_idx"
  ON "PilotAdjusterReceipt"("workspaceId", "createdAt");
ALTER TABLE "PilotAdjusterReceipt" ADD CONSTRAINT "PilotAdjusterReceipt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotAdjusterReceipt" ADD CONSTRAINT "PilotAdjusterReceipt_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "PilotBudgetReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotAdjusterReceipt" ADD CONSTRAINT "PilotAdjusterReceipt_assessmentGenerationId_fkey"
  FOREIGN KEY ("assessmentGenerationId") REFERENCES "AssessmentGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotAdjusterReceipt" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "PilotGenerationReceipt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "assessmentType" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "leaseExpiresAt" TIMESTAMP(3),
  "recoveryRequiredAt" TIMESTAMP(3),
  "authorisedMaxCostUsd" DOUBLE PRECISION NOT NULL,
  "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "assessmentGenerationId" TEXT,
  "response" JSONB,
  "errorMessage" TEXT,
  "resolutionOutcome" TEXT,
  "resolutionEvidence" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotGenerationReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PilotGenerationReceipt_workspaceId_idempotencyKey_key"
  ON "PilotGenerationReceipt"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "PilotGenerationReceipt_operation_key"
  ON "PilotGenerationReceipt"("workspaceId", "reservationId", "inspectionId", "assessmentType", "inputSha256");
CREATE UNIQUE INDEX "PilotGenerationReceipt_assessmentGenerationId_key"
  ON "PilotGenerationReceipt"("assessmentGenerationId");
CREATE INDEX "PilotGenerationReceipt_reservationId_status_idx"
  ON "PilotGenerationReceipt"("reservationId", "status");
CREATE INDEX "PilotGenerationReceipt_workspaceId_createdAt_idx"
  ON "PilotGenerationReceipt"("workspaceId", "createdAt");
ALTER TABLE "PilotGenerationReceipt" ADD CONSTRAINT "PilotGenerationReceipt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotGenerationReceipt" ADD CONSTRAINT "PilotGenerationReceipt_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "PilotBudgetReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotGenerationReceipt" ADD CONSTRAINT "PilotGenerationReceipt_assessmentGenerationId_fkey"
  FOREIGN KEY ("assessmentGenerationId") REFERENCES "AssessmentGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotGenerationReceipt" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "PilotNoChargeApproval" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "receiptKind" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotNoChargeApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PilotNoChargeApproval_receiptKind_receiptId_approvedById_key"
  ON "PilotNoChargeApproval"("receiptKind", "receiptId", "approvedById");
CREATE INDEX "PilotNoChargeApproval_workspaceId_receiptKind_receiptId_idx"
  ON "PilotNoChargeApproval"("workspaceId", "receiptKind", "receiptId");
ALTER TABLE "PilotNoChargeApproval" ADD CONSTRAINT "PilotNoChargeApproval_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotNoChargeApproval" ENABLE ROW LEVEL SECURITY;
