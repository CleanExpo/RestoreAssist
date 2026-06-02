-- CreateTable
CREATE TABLE "VoiceCopilotSession" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "observations" JSONB NOT NULL DEFAULT '[]',
    "missingItems" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "VoiceCopilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceCopilotSession_inspectionId_startedAt_idx" ON "VoiceCopilotSession"("inspectionId", "startedAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotSession_userId_startedAt_idx" ON "VoiceCopilotSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotSession_expiresAt_idx" ON "VoiceCopilotSession"("expiresAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotSession_endedAt_idx" ON "VoiceCopilotSession"("endedAt");

-- AddForeignKey
ALTER TABLE "VoiceCopilotSession" ADD CONSTRAINT "VoiceCopilotSession_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCopilotSession" ADD CONSTRAINT "VoiceCopilotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
