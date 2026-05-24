-- RA-VOI-001: Persist realtime voice copilot lifecycle and observations.

CREATE TABLE "VoiceCopilotSession" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "missingItems" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceCopilotSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceCopilotObservation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rawTranscript" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "needsConfirmation" BOOLEAN NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "storedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceCopilotObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceCopilotSession_inspectionId_startedAt_idx" ON "VoiceCopilotSession"("inspectionId", "startedAt");
CREATE INDEX "VoiceCopilotSession_userId_startedAt_idx" ON "VoiceCopilotSession"("userId", "startedAt");
CREATE INDEX "VoiceCopilotSession_state_expiresAt_idx" ON "VoiceCopilotSession"("state", "expiresAt");
CREATE INDEX "VoiceCopilotObservation_sessionId_createdAt_idx" ON "VoiceCopilotObservation"("sessionId", "createdAt");
CREATE INDEX "VoiceCopilotObservation_type_idx" ON "VoiceCopilotObservation"("type");

ALTER TABLE "VoiceCopilotSession"
    ADD CONSTRAINT "VoiceCopilotSession_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceCopilotSession"
    ADD CONSTRAINT "VoiceCopilotSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceCopilotObservation"
    ADD CONSTRAINT "VoiceCopilotObservation_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "VoiceCopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
