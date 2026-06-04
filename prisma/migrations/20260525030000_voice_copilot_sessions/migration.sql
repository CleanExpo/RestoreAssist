-- RA-VOI-001: Normalize realtime voice copilot observations.
--
-- The prior migration (20260524231500_add_voice_copilot_sessions) created
-- VoiceCopilotSession with embedded JSON observations. This migration evolves
-- that shape to the current Prisma schema by keeping the existing session
-- table and adding the child observation table.

ALTER TABLE "VoiceCopilotSession" DROP COLUMN IF EXISTS "observations";

CREATE TABLE IF NOT EXISTS "VoiceCopilotObservation" (
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

CREATE INDEX IF NOT EXISTS "VoiceCopilotSession_state_expiresAt_idx" ON "VoiceCopilotSession"("state", "expiresAt");
CREATE INDEX IF NOT EXISTS "VoiceCopilotObservation_sessionId_createdAt_idx" ON "VoiceCopilotObservation"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "VoiceCopilotObservation_type_idx" ON "VoiceCopilotObservation"("type");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'VoiceCopilotObservation_sessionId_fkey'
    ) THEN
        ALTER TABLE "VoiceCopilotObservation"
            ADD CONSTRAINT "VoiceCopilotObservation_sessionId_fkey"
            FOREIGN KEY ("sessionId") REFERENCES "VoiceCopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
