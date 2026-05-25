-- Additive mobile/offline mutation and capture-event audit spine.
CREATE TABLE "ClientMutation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "inspectionId" TEXT,
    "mutationId" TEXT NOT NULL,
    "mutationType" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "errorCode" TEXT,
    "clientCreatedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMutation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FieldCaptureEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "inspectionId" TEXT,
    "clientMutationId" TEXT,
    "eventId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "fieldPath" TEXT,
    "value" JSONB,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldCaptureEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientMutation_workspaceId_mutationId_key" ON "ClientMutation"("workspaceId", "mutationId");
CREATE INDEX "ClientMutation_workspaceId_status_receivedAt_idx" ON "ClientMutation"("workspaceId", "status", "receivedAt");
CREATE INDEX "ClientMutation_userId_receivedAt_idx" ON "ClientMutation"("userId", "receivedAt");
CREATE INDEX "ClientMutation_inspectionId_receivedAt_idx" ON "ClientMutation"("inspectionId", "receivedAt");

CREATE UNIQUE INDEX "FieldCaptureEvent_workspaceId_eventId_key" ON "FieldCaptureEvent"("workspaceId", "eventId");
CREATE INDEX "FieldCaptureEvent_workspaceId_eventType_receivedAt_idx" ON "FieldCaptureEvent"("workspaceId", "eventType", "receivedAt");
CREATE INDEX "FieldCaptureEvent_inspectionId_capturedAt_idx" ON "FieldCaptureEvent"("inspectionId", "capturedAt");
CREATE INDEX "FieldCaptureEvent_clientMutationId_idx" ON "FieldCaptureEvent"("clientMutationId");

ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_clientMutationId_fkey" FOREIGN KEY ("clientMutationId") REFERENCES "ClientMutation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
