-- Sprint G: Inspection Intelligence — Evidence Schema
-- 17 evidence classes with chain-of-custody metadata
-- IICRC S500:2025 compliant evidence tracking

-- CreateEnum: EvidenceClass (17 classes)
CREATE TYPE "EvidenceClass" AS ENUM (
  'MOISTURE_READING',
  'THERMAL_IMAGE',
  'AMBIENT_ENVIRONMENTAL',
  'PHOTO_DAMAGE',
  'PHOTO_EQUIPMENT',
  'PHOTO_PROGRESS',
  'PHOTO_COMPLETION',
  'VIDEO_WALKTHROUGH',
  'FLOOR_PLAN',
  'SCOPE_DOCUMENT',
  'LAB_RESULT',
  'AUTHORITY_FORM',
  'EQUIPMENT_LOG',
  'TECHNICIAN_NOTE',
  'VOICE_MEMO',
  'THIRD_PARTY_REPORT',
  'COMPLIANCE_CERTIFICATE'
);

-- CreateEnum: WorkflowStepStatus
CREATE TYPE "WorkflowStepStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
  'BLOCKED'
);

-- CreateTable: InspectionWorkflow (state machine for guided capture)
CREATE TABLE "InspectionWorkflow" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "experienceLevel" TEXT NOT NULL DEFAULT 'APPRENTICE',
  "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
  "totalSteps" INTEGER NOT NULL DEFAULT 0,
  "completedSteps" INTEGER NOT NULL DEFAULT 0,
  "skippedSteps" INTEGER NOT NULL DEFAULT 0,
  "isReadyToSubmit" BOOLEAN NOT NULL DEFAULT false,
  "submissionScore" DOUBLE PRECISION,
  "lastValidatedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InspectionWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkflowStep (individual steps within a workflow)
CREATE TABLE "WorkflowStep" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "stepKey" TEXT NOT NULL,
  "stepTitle" TEXT NOT NULL,
  "stepDescription" TEXT,
  "stepDescriptionShort" TEXT,
  "requiredEvidenceClasses" TEXT NOT NULL,
  "optionalEvidenceClasses" TEXT,
  "minimumEvidenceCount" INTEGER NOT NULL DEFAULT 1,
  "isMandatory" BOOLEAN NOT NULL DEFAULT true,
  "riskTier" INTEGER NOT NULL DEFAULT 1,
  "escalationNote" TEXT,
  "status" "WorkflowStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EvidenceItem (individual evidence with chain-of-custody)
CREATE TABLE "EvidenceItem" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "evidenceClass" "EvidenceClass" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "capturedById" TEXT NOT NULL,
  "capturedByName" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capturedLat" DOUBLE PRECISION,
  "capturedLng" DOUBLE PRECISION,
  "deviceId" TEXT,
  "deviceType" TEXT,
  "fileUrl" TEXT,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "thumbnailUrl" TEXT,
  "structuredData" TEXT,
  "workflowStepId" TEXT,
  "affectedAreaId" TEXT,
  "hashSha256" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ExceptionReason (documents why required evidence was skipped)
CREATE TABLE "ExceptionReason" (
  "id" TEXT NOT NULL,
  "evidenceItemId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reasonText" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "notifiedAdminAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExceptionReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: InspectionWorkflow
CREATE UNIQUE INDEX "InspectionWorkflow_inspectionId_key" ON "InspectionWorkflow"("inspectionId");
CREATE INDEX "InspectionWorkflow_inspectionId_idx" ON "InspectionWorkflow"("inspectionId");
CREATE INDEX "InspectionWorkflow_jobType_idx" ON "InspectionWorkflow"("jobType");

-- CreateIndex: WorkflowStep
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stepOrder_key" ON "WorkflowStep"("workflowId", "stepOrder");
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stepKey_key" ON "WorkflowStep"("workflowId", "stepKey");
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");
CREATE INDEX "WorkflowStep_status_idx" ON "WorkflowStep"("status");

-- CreateIndex: EvidenceItem
CREATE INDEX "EvidenceItem_inspectionId_idx" ON "EvidenceItem"("inspectionId");
CREATE INDEX "EvidenceItem_evidenceClass_idx" ON "EvidenceItem"("evidenceClass");
CREATE INDEX "EvidenceItem_capturedById_idx" ON "EvidenceItem"("capturedById");
CREATE INDEX "EvidenceItem_capturedAt_idx" ON "EvidenceItem"("capturedAt");
CREATE INDEX "EvidenceItem_workflowStepId_idx" ON "EvidenceItem"("workflowStepId");
CREATE INDEX "EvidenceItem_inspectionId_evidenceClass_idx" ON "EvidenceItem"("inspectionId", "evidenceClass");

-- CreateIndex: ExceptionReason
CREATE UNIQUE INDEX "ExceptionReason_evidenceItemId_key" ON "ExceptionReason"("evidenceItemId");
CREATE INDEX "ExceptionReason_reasonCode_idx" ON "ExceptionReason"("reasonCode");
CREATE INDEX "ExceptionReason_approvedById_idx" ON "ExceptionReason"("approvedById");

-- AddForeignKey: InspectionWorkflow -> Inspection
ALTER TABLE "InspectionWorkflow" ADD CONSTRAINT "InspectionWorkflow_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WorkflowStep -> InspectionWorkflow
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "InspectionWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EvidenceItem -> Inspection
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EvidenceItem -> WorkflowStep (optional)
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_workflowStepId_fkey" FOREIGN KEY ("workflowStepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ExceptionReason -> EvidenceItem
ALTER TABLE "ExceptionReason" ADD CONSTRAINT "ExceptionReason_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS on all new tables (Supabase requirement)
ALTER TABLE "InspectionWorkflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExceptionReason" ENABLE ROW LEVEL SECURITY;

-- RLS Policies: InspectionWorkflow (access via inspection ownership)
CREATE POLICY "InspectionWorkflow_select_own" ON "InspectionWorkflow"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Inspection" i WHERE i."id" = "inspectionId" AND i."userId" = auth.uid()::text)
  );

CREATE POLICY "InspectionWorkflow_insert_own" ON "InspectionWorkflow"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Inspection" i WHERE i."id" = "inspectionId" AND i."userId" = auth.uid()::text)
  );

CREATE POLICY "InspectionWorkflow_update_own" ON "InspectionWorkflow"
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "Inspection" i WHERE i."id" = "inspectionId" AND i."userId" = auth.uid()::text)
  );

-- RLS Policies: WorkflowStep (access via workflow -> inspection ownership)
CREATE POLICY "WorkflowStep_select_own" ON "WorkflowStep"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "InspectionWorkflow" w
      JOIN "Inspection" i ON i."id" = w."inspectionId"
      WHERE w."id" = "workflowId" AND i."userId" = auth.uid()::text
    )
  );

CREATE POLICY "WorkflowStep_insert_own" ON "WorkflowStep"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "InspectionWorkflow" w
      JOIN "Inspection" i ON i."id" = w."inspectionId"
      WHERE w."id" = "workflowId" AND i."userId" = auth.uid()::text
    )
  );

CREATE POLICY "WorkflowStep_update_own" ON "WorkflowStep"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "InspectionWorkflow" w
      JOIN "Inspection" i ON i."id" = w."inspectionId"
      WHERE w."id" = "workflowId" AND i."userId" = auth.uid()::text
    )
  );

-- RLS Policies: EvidenceItem (access via inspection ownership)
CREATE POLICY "EvidenceItem_select_own" ON "EvidenceItem"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Inspection" i WHERE i."id" = "inspectionId" AND i."userId" = auth.uid()::text)
  );

CREATE POLICY "EvidenceItem_insert_own" ON "EvidenceItem"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Inspection" i WHERE i."id" = "inspectionId" AND i."userId" = auth.uid()::text)
  );

CREATE POLICY "EvidenceItem_update_own" ON "EvidenceItem"
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "Inspection" i WHERE i."id" = "inspectionId" AND i."userId" = auth.uid()::text)
  );

-- RLS Policies: ExceptionReason (access via evidence -> inspection ownership)
CREATE POLICY "ExceptionReason_select_own" ON "ExceptionReason"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "EvidenceItem" e
      JOIN "Inspection" i ON i."id" = e."inspectionId"
      WHERE e."id" = "evidenceItemId" AND i."userId" = auth.uid()::text
    )
  );

CREATE POLICY "ExceptionReason_insert_own" ON "ExceptionReason"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "EvidenceItem" e
      JOIN "Inspection" i ON i."id" = e."inspectionId"
      WHERE e."id" = "evidenceItemId" AND i."userId" = auth.uid()::text
    )
  );

CREATE POLICY "ExceptionReason_update_own" ON "ExceptionReason"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "EvidenceItem" e
      JOIN "Inspection" i ON i."id" = e."inspectionId"
      WHERE e."id" = "evidenceItemId" AND i."userId" = auth.uid()::text
    )
  );
